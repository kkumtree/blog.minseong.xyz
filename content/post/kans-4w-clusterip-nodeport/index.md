---
date: 2024-09-27T21:28:17+09:00
title: "Kubernetes Service(1): ClusterIP/NodePort"
tags:
  - kans  
  - kind    
  - kubernetes  
authors:
  - name: kkumtree
    bio: plumber for infra
    email: mscho7969@ubuntu.com
    launchpad: mscho7969
    github: kkumtree
    profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: false # 글 초안 여부
---

Kubernetes의 (컨셉, 혹은 콘셉트라 불리는) [Concepts](https://kubernetes.io/docs/concepts/) 중에서 Service의 주제를 다뤄봅니다.  

Service [Docs](https://kubernetes.io/docs/concepts/services-networking/service/)에 명료하게 적혀있긴 하지만,  
단위 기능으로 잘게 쪼갠 Pod는 결국 개별적인 IP를 갖게되는데, Blue/Green 이미지 업데이트를 비롯해서 같은 기능을 하는 새로운 Pod의 IP를 다른 Pod가 IP주소 그대로 접근하기 어려워 중간에 둔 것으로 이해를 해보았습니다.  

지금 레벨에서는 가정용 공유기에서 동적IP 환경에 대응하기 위해, DDNS를 사용하는 것과, MAC ADDR 기준으로 Static IP(DHCP모드시 활용)를 예약하는 것을 섞은 그 어딘가로 납득하고 계속 써보도록 하겠습니다.  

## 1. Service type 그리고 ClusterIP와 NodePort  

[Service type](https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services-service-types)은 expose(노출)범위에 따라, 아래와 같이 4가지입니다.  

- **ClusterIP(default)**: (클러스터의) 내부 IP 대역에 노출시킵니다. 
  같은 뜻은 동일 클러스터 내부에서만 해당 서비스에 접근할 수 있습니다. 
	Service에 대한 고정된 호출방법을 구성하는데, Static Virtual IP(고정 가상IP)와 Domain Name(주소, 혹은 도메인 네임)을 제공합니다.  
- **NodePort**: (클러스터를 구성하는) 각 노드의 외부IP를 통해 접근할 수 있는 포트를 지정합니다. 
  어떻게보면 공유기의 `port-forward` 정도로 생각하면 좋을 것 같습니다.  
  눈만 뜨면 늘 새로워 보이는 k8s 인지라, 이제서야 눈치를 챘지만 ClusterIP랑 배타적인 것은 아닙니다.  
- LoadBalancer: 각 CSP에서 제공되는 LB를 기반으로 서비스의 "외부" 노출범위 결정권을 LB에 넘기는 것으로만 이해하는 중인데,  
  이건 다음주차에 다뤄질 예정인지라 이번에는 다루지 않습니다.  
- ExternalName: CNAME 레코드 관리이며, 프록시가 구성되지 않는다고합니다. `no proxying of any kind`  
  DNS공급자랑 호환(ACME)이 안되면 난이도가 매우 높아지는 걸로만 파악.  
	이 또한 생략.  

> 이거로 ClusterIP와 NodePort를 다 이해하면 좋겠지만, iptables 처리도 이해가 필요했습니다.  

결국 Network traffic의 문제라 어디에서 이를 처리하는지도 봐야합니다.  

### a. ClusterIP  

- iptables: Control Plane의 iptables Rule에 의해 각 노드에 배포된 Pod에 연결됩니다.  
- load balancing: 랜덤으로 각 파드에 부하분산(공통)
- `sessionAffinity`: 고정적인 접속 지원 및 최대 세션 고정 시간[default: 10800 (sec)]을 설정할 수 있음.  

#### ClusterIP의 단점

- Health Check(H/C) 불가: 어플리케이션에 오류가 있는 Pod에 접근 가능.  
  `Readiness Probe` 설정으로 서비스 엔드포인트에서 제외하여 이를 구현할 수 있음.  
- `sessionAffinity` 이외에는 분산 방식 설정 불가능.  
  cf. `IPVS`: 다양한 분산방식(알고리즘) 가능.  

### b. NodePort  

- iptables: 특정 Node의 iptables에 의해 이루어집니다. 노드의 Public IP 등을 통해 접속하는데  
  해당 노드 안에 없는 Pod여도 다른 노드로 리디렉션되는 것으로 보입니다.  
- load balancing: 랜덤으로 각 파드에 부하분산(공통)  

#### NodePort의 단점

- 보안 취약: 외부에서 노드의 Public IP 및 포트로 접속하니까. LoadBalancer Service Type으로 외부 공개 최소화.  
- 기본적으로 외부 클라이언트의 IP를 웹서버에서 수집 불가함. 노드의 IP로 SNAT 되기 때문.  
 `{  externalTrafficPolicy: local }` 설정시, 해당 노드에 배치된 파드로만 접속되기에 SNAT되지 않아 수집가능.  
- `{ externalTrafficPolicy: local }` 상태에서 파드가 존재하지 않는 노드IP의 NodePort로 접속 시 실패.  
  이 또한 LB Service Type에서 Probe(H/C)로 대응 가능.  

## 2. kube-proxy 모드 정리

> Mode: iptables / ipvs / nftables / eBPF  
> `kube-proxy` 가 이제 kubernetes 운용시 optional로 되었지만, 각 모드 자체는 인지할 필요성이 있었습니다.  

### a. user space (deprecated)  

- 1 Port : 1 Service Mapping  
- user space -> kernel space: 변환 비용  
- kube-proxy 프로세스 장애시, SPOF. 대응이 어려움  

### b. iptables (iptables APIs -> netfilter subsystem)  

- SPOF 해소: `netfilter`가 proxy 역할을 대신 수행  
- kube-proxy: netfilter rule 수정 담당, DaemonSet 구성  

### c. IPVS (kernel IPVS, iptables APIs -> netfilter subsystem)  

> 사실 이거 때문에 정리를 했습니다.  

- `IPVS` 란?  
  - Linux 커널단에서 제공하는 L4 Load Balancer: transport에서는 Port로 서비스 구분  
	- iptables와 유사한 netfilter hook 기능을 기반으로 하나,  
	  hash table을 default 데이터 구조로 사용하고, **kernel** space에서 동작.  
	- 결국, Packet LB 수행시 iptable보다 높은 성능을 보임.  
	  - Proxy rule sync 및 리디레션 latency, 높은 network traffic 처리에 있어 성능 향상.  
### d. nftables (ntables API -> netfilter subsystem)  

- Only available on Linux Node, specific Linux kernel(>=5.13) required.  
- Alternative of iptables API for speed and scailability.  
- 현재 k8s v1.31 기준, 모든 network plugin과 호환되지 않을 것이라고 확인.  

### e. eBPF (+XDP Networking Module)  

- L3/L4 구간(Netfilter <-> TCP/UCP)을 거치는 kernel overhead마저 bypass 목적  


---
date: 2024-09-29T13:35:13+09:00
title: "iptables monitoring with Grafana"
tags:
 - kans
 - kind
 - iptables
 - kubernetes
 - grafana
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

iptables를 수집하여 Grafana로 표현하는 방법을 알아봅니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 0. 환경 구성 (kind)

> 작성시간 이슈로 featureGates, ConfigPatches, networking 설정 설명은 스킵...합니다.  

### a. 1 Master, 4 Slave 환경 구성  

```bash
cat <<EOT> kind-svc-1w.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
featureGates:
  "InPlacePodVerticalScaling": true
  "MultiCIDRServiceAllocator": true
nodes:
- role: control-plane
  labels:
    mynode: control-plane
    topology.kubernetes.io/zone: ap-northeast-2a
  extraPortMappings:
  - containerPort: 30000
    hostPort: 30000
  - containerPort: 30001
    hostPort: 30001
  - containerPort: 30002
    hostPort: 30002
  kubeadmConfigPatches:
  - |
    kind: ClusterConfiguration
    apiServer:
      extraArgs:
        runtime-config: api/all=true
    controllerManager:
      extraArgs:
        bind-address: 0.0.0.0
    etcd:
      local:
        extraArgs:
          listen-metrics-urls: http://0.0.0.0:2381
    scheduler:
      extraArgs:
        bind-address: 0.0.0.0
  - |
    kind: KubeProxyConfiguration
    metricsBindAddress: 0.0.0.0
- role: worker
  labels:
    mynode: worker1
    topology.kubernetes.io/zone: ap-northeast-2a
- role: worker
  labels:
    mynode: worker2
    topology.kubernetes.io/zone: ap-northeast-2b
- role: worker
  labels:
    mynode: worker3
    topology.kubernetes.io/zone: ap-northeast-2c
networking:
  podSubnet: 10.10.0.0/16
  serviceSubnet: 10.200.1.0/24
EOT

kind create cluster --config kind-svc-1w.yaml --name myk8s --image kindest/node:v1.31.0
```

### b. 기본 툴 설치  

```bash
docker exec -it myk8s-control-plane sh -c 'apt update && apt install tree psmisc lsof wget bsdmainutils bridge-utils net-tools ipset ipvsadm nfacct tcpdump ngrep iputils-ping arping git vim arp-scan -y'
```

## 1. prometheus stack 설치 (helm)

### a. repository 추가 및 구성

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

cat <<EOT > monitor-values.yaml
prometheus:
  prometheusSpec:
    podMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelectorNilUsesHelmValues: false
    nodeSelector:
      mynode: control-plane
    tolerations:
    - key: "node-role.kubernetes.io/control-plane"
      operator: "Equal"
      effect: "NoSchedule"


grafana:
  defaultDashboardsTimezone: Asia/Tokyo
  adminPassword: kans7969

  service:
    type: NodePort
    nodePort: 30002
  nodeSelector:
    mynode: control-plane
  tolerations:
  - key: "node-role.kubernetes.io/control-plane"
    operator: "Equal"
    effect: "NoSchedule"

defaultRules:
  create: false
alertmanager:
  enabled: false

EOT 
```  

### b. 설치  

```bash
kubectl create ns monitoring
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack --version 62.3.0 -f monitor-values.yaml --namespace monitoring
```

### c. prometheus 콘솔 접속

> 새로운 터미널을 열어, port-forwarding을 통해 접속합니다.  

```bash
# New Terminal
kubectl port-forward svc/kube-prometheus-stack-grafana -n monitoring 9090:9090
```

골치 아픈 etcd 마저 붙은 걸 알 수 있습니다.  

> 사실, 바로 충돌될 줄 알고, 기대했는데... 저런.  

충돌난다면, 주요한 이슈는 맨 위의 kind에서 지정한 port 불일치입니다.  
아래를 참고하여 고쳐보세요.  

```bash  
helm upgrade --install \
  --namespace monitoring --create-namespace \
  --repo https://prometheus-community.github.io/helm-charts \
  kube-prometheus-stack kube-prometheus-stack --values - <<EOF
kubeEtcd:
  service:
    targetPort: 2381
EOF
```

## 2. Grafana dashboard 확인  

Grafana에 접속해봅시다.  

> kube-prometheus-stack을 기본 설치하면, node-exporter와 grafana도 함께 설치됩니다.  

### a. 접속 정보 확인

우선 접속할 ID와 패스워드를 알아야겠죠.  

```bash
kubectl get secret -n monitoring kube-prometheus-stack-grafana -o jsonpath="{.data.admin-user}" | base64 --decode ; echo
# admin
kubectl get secret -n monitoring kube-prometheus-stack-grafana -o jsonpath="{.data.admin-password}" | base64 --decode ; echo
# kans7969
```

...~~이렇게나 위험한걸 다들 쓰고있다니 존경합니다.~~  

### b. Port 확인

앞에서 Grafana의 경우 NodePort로 미리 지정했기 때문에, 프로메테우스 때와는 달리 별도의 port-forwarding 설정은 필요없습니다.  

```bash
kubectl get svc -A -owide | grep NodePort
# monitoring    kube-prometheus-stack-grafana                    NodePort    10.200.1.25    <none>        80:30002/TCP                   101m   app.kubernetes.io/instance=kube-prometheus-stack,app.kubernetes.io/name=grafana
```

위의 경우에는 kind를 구성한, 컴퓨터의 브라우저에서 `localhost:30002`로 접속하면 됩니다.

### c. Dashboard 확인

- Dashboard(13674): [Grafana Labs](https://grafana.com/grafana/dashboards/13674-iptables-montoring-dashboard/)

음 역시. 뭐가 많이 부족하죠? 각 노드의 iptables rule과 io up/down이 확인이 안되네요.  

![grafana-first-try](images/grafana-first-try.png)  

이제 이걸해야됩니다.  

## 3. iptables exporter 설정

(눈물의 작성 중)

## Reference

<https://medium.com/@charled.breteche/kind-fix-missing-prometheus-operator-targets-1a1ff5d8c8ad>  

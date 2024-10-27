---
date: 2024-10-26T01:35:59+09:00
title: ""
tags:
 - kans
 - ebpf
 - cilium
 - kubeadm
 - kubernetes
authors:
  - name: kkumtree
    bio: plumber for infra
    email: mscho7969@ubuntu.com
    launchpad: mscho7969
    github: kkumtree
    profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

그럼 매번 실패만 했던 Cilium 배포를 한번 해볼까요?  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 1. CSP VM 골라보기  

이렇게 쓴 이유는 결국 네트워크를 `잘` 알아야하는데,  
작년에 할 때는 그런거 생각도 안하고 그냥 올려보려 했으니 당연히 안 돌아가겠죠?  

- [trying2adult/What Is XDP And How Do You Use It In Linux](https://trying2adult.com/what-is-xdp-and-how-do-you-use-it-in-linux-amazon-ec2-example/)  

그냥 곰곰히 오리~~duckduckgo~~랑 투닥거리다보니, 비록 연식이 되긴 했지만  
클릭을 안하고는 못배길 위의 블로그 제목이 눈에 띄였습니다.  

### a. 사전 조사  

1. 커널:  
  - 현재 리눅스 커널 버전이 마이너 버전은 못 외우겠지만, 대충 메이저가 6버전이니 PASS
2. NIC:  
  - ENA(Elastic Network Adapter) 드라이버 언급이 나온 것으로 봐선,  
    지원 인스턴스를 올리면 덜 헤멜 것 같은 느낌이 듭니다.  
3. MTU 상한: 
  - cilium 최신 버전도 상한값이 3818인지 확인하면 좋을 듯합니다. 
4. NIC channels for RX/TX Queue:  
  - 절반 이상을 비워야한다는데, 채널 수 모르면 좀 많이 헤맬 것 같습니다.  

### b. AWS CLI로 확인 

- Docs:  
  - [Test whether enhanced networking is enabled](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/enhanced-networking-ena.html#test-enhanced-networking-ena)  
  - [Query for the latest Amazon Linux AMI IDs using AWS Systems Manager Parameter Store](https://aws.amazon.com/blogs/compute/query-for-the-latest-amazon-linux-ami-ids-using-aws-systems-manager-parameter-store/)

스터디에서 제공된 CloudFormation파일 중 AMI은  
Canonical에서 관리하는 SSM 파라미터를 통해 최신화를 할 수 있었습니다.  
그래서 그냥 이 SSM 파라미터를 통해 AMI ID를 얻어와 보죠.  

```bash
aws ssm get-parameters --names /aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id --region ap-northeast-2
```

```json
{
    "Parameters": [
        {
            "Name": "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id",
            "Type": "String",
            "Value": "ami-042e76978adeb8c48",
            "Version": 30,
            "LastModifiedDate": "2024-09-27T13:11:50.127000+09:00",
            "ARN": "arn:aws:ssm:ap-northeast-2::parameter/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id",
            "DataType": "aws:ec2:image"
        }
    ],
    "InvalidParameters": []
}
```

당연히 `enaSupport`가 `true`로 나오네요. 

```bash
aws ec2 describe-images --image-id ami-042e76978adeb8c48 --query "Images[].EnaSupport"
# [
#     true
# ]
```

눈감고 `c5.16xlarge` 를 띄워볼까 싶긴한데, 아래 문서에서 Nitro v2 버전 탭에 T3도 있는 것을 확인했네요.  
Cloudformation YAML에 기본 정의된 `t3.xlarge`를 써보겠습니다.  
- [Virtualized instances
/AWS](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-nitro-instances.html#nitro-instance-types)

### c. 프로비저닝 후 기본 체크  

- 스터디에서 제공된 대로, `kube-proxy` 없이 운용 테스트를 할 것이기에 확인을 해보겠습니다.  
- 이미 `kubeadm` 배포 시, `--skip-phases=addon/kube-proxy` param이 적용되어 있습니다.  

- No `kube-proxy`  

```bash
# Access to Control Plane Node
ssh -i $Keypair ubuntu@$ControlPlaneIP  

# Not ready because of no kube-proxy 
kubectl get nodes
# NAME     STATUS     ROLES           AGE   VERSION
# k8s-s    NotReady   control-plane   14m   v1.30.6
# k8s-w1   NotReady   <none>          13m   v1.30.6
# k8s-w2   NotReady   <none>          13m   v1.30.6

# No kube-proxy
kubectl cluster-info
# Kubernetes control plane is running at https://192.168.10.10:6443
# CoreDNS is running at https://192.168.10.10:6443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

# No kube-proxy  
kubectl get pod -A
# NAMESPACE     NAME                            READY   STATUS    RESTARTS   AGE
# kube-system   coredns-55cb58b774-h9dnm        0/1     Pending   0          14m
# kube-system   coredns-55cb58b774-vjzrk        0/1     Pending   0          14m
# kube-system   etcd-k8s-s                      1/1     Running   0          14m
# kube-system   kube-apiserver-k8s-s            1/1     Running   0          14m
# kube-system   kube-controller-manager-k8s-s   1/1     Running   0          14m
# kube-system   kube-scheduler-k8s-s            1/1     Running   0          14m
```

- 커널 확인: 안해도 되지만, 한번 보겠습니다.  

```bash
# Kernel Version
uname -a
# Linux k8s-s 6.8.0-1015-aws #16~22.04.1-Ubuntu SMP Mon Aug 19 19:38:17 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux
hostnamectl | grep Kernel
          # Kernel: Linux 6.8.0-1015-aws

# XDP Support
grep -i CONFIG_XDP_SOCKETS /boot/config-$(uname -r)
# CONFIG_XDP_SOCKETS=y
# CONFIG_XDP_SOCKETS_DIAG=m
```

- NIC 확인  

```bash
netplan status | grep ethernet
# ●  1: lo ethernet UNKNOWN/UP (unmanaged)
# ●  2: ens5 ethernet UP (networkd: ens5)

# MTU
ip link show ens5 | grep mtu
# 2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 9001 qdisc mq state UP mode DEFAULT group default qlen 1000


# RX/TX Queue
ethtool -l ens5
# Channel parameters for ens5:
# Pre-set maximums:
# RX:		n/a
# TX:		n/a
# Other:		n/a
# Combined:	4
# Current hardware settings:
# RX:		n/a
# TX:		n/a
# Other:		n/a
# Combined:	4

# Driver
ethtool -i ens5 | grep ena
# driver: ena
```

Cilium에서 요구사항을 따로 살펴봐야겠지만,  
MTU 및 RX/TX Queue 관련 채널 값을 바꿔야할 것으로 보입니다.  

## 2. Cilium 설치

- 설치 전에 미리 OS에서 파라미터 조정을 해보겠습니다.  

### a. 파라미터 조정

크게 두 가지 파라미터 조정해둡니다.  
- Maxium MTU: 3498  
  - 최신문서(v1.16.3)에서는 값이 더 낮아져서 3498로 조정합니다.  
- RX/TX Queue: more than half  

RX/TX Queue는 그렇다고 치고, MTU의 경우에는 왜 조정해야되는지 아래에도 설명되어있으니 참조하시면 됩니다.  
- [NodPort on AWS/cilium](https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/#nodeport-xdp-on-aws)

```bash
# MTU
ip link set dev ens5 mtu 3498
ip link show ens5 | grep mtu
2: ens5: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 3498 qdisc mq state UP mode DEFAULT group default qlen 1000

# RX/TX Queue
ethtool -L ens5 combined 1
ethtool -l ens5
# Channel parameters for ens5:
# Pre-set maximums:
# RX:		n/a
# TX:		n/a
# Other:		n/a
# Combined:	4
# Current hardware settings:
# RX:		n/a
# TX:		n/a
# Other:		n/a
# Combined:	1
```

### b. helm 배포  

```bash  
helm repo add cilium https://helm.cilium.io/
helm repo update

helm install cilium cilium/cilium --version 1.16.3 --namespace kube-system \
--set k8sServiceHost=192.168.10.10 --set k8sServicePort=6443 --set debug.enabled=true \
--set rollOutCiliumPods=true --set routingMode=native --set autoDirectNodeRoutes=true \
--set bpf.masquerade=true --set bpf.hostRouting=true --set endpointRoutes.enabled=true \
--set ipam.mode=kubernetes --set k8s.requireIPv4PodCIDR=true --set kubeProxyReplacement=true \
--set ipv4NativeRoutingCIDR=192.168.0.0/16 --set installNoConntrackIptablesRules=true \
--set hubble.ui.enabled=true --set hubble.relay.enabled=true --set prometheus.enabled=true --set operator.prometheus.enabled=true --set hubble.metrics.enableOpenMetrics=true \
--set hubble.metrics.enabled="{dns:query;ignoreAAAA,drop,tcp,flow,port-distribution,icmp,httpV2:exemplars=true;labelsContext=source_ip\,source_namespace\,source_workload\,destination_ip\,destination_namespace\,destination_workload\,traffic_direction}" \
--set operator.replicas=1
```



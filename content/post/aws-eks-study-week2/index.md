---
date: 2023-05-04T16:37:11+09:00
title: "AWS EKS 스터디 2주차"
tags:
 - AWS
 - EKS
 - CloudNet@
 - network
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

지난 1주차에 이어, 이번 주에는 EKS의 네트워크 구성에 대해 알아보는 시간이었습니다.  

직전 스터디에서도 바로 광탈당하나?하며 밤과 주말을 하얗게 불태웠을 정도로  
가장 고난도라고 생각했던 네트워크를 다시 만나니 이제 1% 친근감이 느껴지고 있네요.  

![이해했냐고요?](./images/00_intro.jpeg)

자 그럼 해보도록 합시다.

## cloudformation을 활용한 EKS 원클릭 구성

- 학습을 위해, 이번에도 [가시다](https://www.notion.so/gasidaseo/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)님이 준비해주신 원클릭 배포 yaml을 활용하여 배포.
- **완전 배포까지 대략 20분 가량 소요**
- IAM에서 미리 발급해둔 액세스키/시크릿키를 알아두어야합니다.  
- 스크린샷은 1주차로 갈음.  

```bash
# 원클릭 셋업
aws cloudformation deploy --template-file ~/Documents/aews/eks-oneclick.yaml --stack-name myeks --parameter-overrides KeyName=aews SgIngressSshCidr=$(curl -s ipinfo.io/ip)/32 MyIamUserAccessKeyID={ACSSKEY|AKIA..}  MyIamUserSecretAccessKey={SECUKEY|7ob} ClusterBaseName=myeks --region ap-northeast-2

# 컨트롤 플레인(마스터노드) 접속 확인
ssh -i ~/.ssh/aews.pem ec2-user@$(aws cloudformation describe-stacks --stack-name myeks --query 'Stacks[*].Outputs[0].OutputValue' --output text)
```

## 기본 셋업 (in Control Plane)

- 네임스페이스는 미리 default로 설정.  
  이걸 깜박해서, 지난 스터디 때 헛된 시행착오를 반복했던 이력이 있음.  
- (워커)노드 IP 확인 및 변수 지정  
  워커노드는 EKS에서 `데이터플레인`이라고도 함.  
- eksctl addon으로 설치된 아래 3가지 항목의 정상 설치 확인  
  - codedns
  - kube-proxy
  - **vpc-cni**
- 스터디에서는 경이로운(?) AWS VPC CNI를 사용.  
  Calico CNI와 달리 데이터플레인(노드)의 AWS ENI(Elastic Network Interface)와 Pod가 같은 네트워크 대역(CIDR)을 사용한다!
- 예시:  
  - eth0(ENI): 10.10.1.1/24
  - Pod1: 10.10.1.**10**
  - Pod2: 10.10.1.**20**
- 실제로도 데이터플레인과 Pod가 같은 네트워크 대역을 사용한다.
  - 왜 IP까지 동일하지...? CIDR /32가 걸린건가? 혼란에 빠졌다! **(To-Do)**

```bash
# default 네임스페이스 설정

kubectl ns default

# 데이터플레인 IP 확인 및 변수 지정

N1=$(kubectl get node --label-columns=topology.kubernetes.io/zone --selector=topology.kubernetes.io/zone=ap-northeast-2a -o jsonpath={.items[0].status.addresses[0].address}) 
N2=$(kubectl get node --label-columns=topology.kubernetes.io/zone --selector=topology.kubernetes.io/zone=ap-northeast-2b -o jsonpath={.items[0].status.addresses[0].address}) 
N3=$(kubectl get node --label-columns=topology.kubernetes.io/zone --selector=topology.kubernetes.io/zone=ap-northeast-2c -o jsonpath={.items[0].status.addresses[0].address}) 
echo "export N1=$N1" >> /etc/profile 
echo "export N2=$N2" >> /etc/profile 
echo "export N3=$N3" >> /etc/profile 
echo $N1, $N2, $N3

# 데이터플레인 <-> 컨트롤플레인 ssh 접속을 위해 모든 프로토콜 허용

NGSGID=$(aws ec2 describe-security-groups --filters Name=group-name,Values=*ng1* --query "SecurityGroups[*].[GroupId]" --output text) 
aws ec2 authorize-security-group-ingress --group-id $NGSGID --protocol '-1' --cidr 192.168.1.100/32

# 노드 ssh 접속 확인

ssh ec2-user@$N1 hostname 
ssh ec2-user@$N2 hostname 
ssh ec2-user@$N3 hostname

# eksctl addon 확인

eksctl get addon --cluster $CLUSTER_NAME

# 2023-05-04 19:04:32 [ℹ]  Kubernetes version "1.24" in use by cluster "myeks"
# 2023-05-04 19:04:32 [ℹ]  getting all addons
# 2023-05-04 19:04:33 [ℹ]  to see issues for an addon run `eksctl get addon --name <addon-name> --cluster <cluster-name>`
# NAME  VERSION   STATUS 
# coredns  v1.9.3-eksbuild.3 ACTIVE 
# kube-proxy v1.24.10-eksbuild.2 ACTIVE 
# vpc-cni  v1.12.6-eksbuild.1 ACTIVE 

# AWS VPC CNI 관련
# 각각 노드(컨트롤플레인)IP 와 Pod IP 확인하는 명령어

aws ec2 describe-instances --query "Reservations[*].Instances[*].{PublicIPAdd:PublicIpAddress,PrivateIPAdd:PrivateIpAddress,InstanceName:Tags[?Key=='Name']|[0].Value,Status:State.Name}" --filters Name=instance-state-name,Values=running --output table
kubectl get pod -n kube-system -o=custom-columns=NAME:.metadata.name,IP:.status.podIP,STATUS:.status.phase

# kube-proxy config 확인 (mode: “iptables” 사용)

kubectl describe cm -n kube-system kube-proxy-config | grep mode
```

### kube-proxy에서 ipvs 대신 iptables를 사용하는 것일까?  

- 가시다님이 설명하시길 ARP고정이나 가상 인터페이스 이슈 등으로 iptables를 쓰는 것으로 보인다고 하였음.  
- 더 찾아보니, 해당 이슈는 `19년 1월`부터 제기되어 왔음.  
  참조: [AWS-github](https://github.com/aws/containers-roadmap/issues/142#issuecomment-1367437044)
- `22년 12월`에 ipvs에 대한 지원이 GA되었음.  
  참조: [AWS-blog](https://aws.amazon.com/blogs/containers/amazon-eks-add-ons-advanced-configuration/)

- ipvs가 iptables보다 나은가?  
  해당 내용은 [KubeCon Europe 2019에서 발표된 내용](https://github.com/sbueringer/kubecon-slides/blob/master/slides/2017-kubecon-eu/Scale%20Kubernetes%20to%20Support%2050%2C000%20Services%20%5BI%5D%20-%20Haibin%20Xie%20%26%20Quinton%20Hoole%2C%20Huawei%20Technologies%20-%20Scale%20Kubernetes%20to%20Support%2050000%20Services.pdf)에서 언급된다.  
  - 아래와 같이 서비스의 수에 따라 [시간복잡도](https://blog.naver.com/alice_k106/221606077410)에 의해 발생하는 지연을 줄일 수 있다고 한다. (iptables: O(N), ipvs: O(1))

![CC BY 3.0 The Linux Foundation](./images/2017-kubecon-eu-huawei.png)

## 컨트롤플레인 네트워크 확인

- 노드에 tcpdump 등 네트워크 관련 도구르 설치를 하여 확인해본다.  
- [k8s CNI](https://kubernetes.io/docs/concepts/cluster-administration/networking/) : 쿠버네티스의 네트워크 환경을 구성해주는 플러그인 (Container Network Interface)  

```bash
# 각 데이터플레인에 도구 설치

ssh ec2-user@$N1 sudo yum install links tree jq tcpdump -y 
ssh ec2-user@$N2 sudo yum install links tree jq tcpdump -y 
ssh ec2-user@$N3 sudo yum install links tree jq tcpdump -y

# CNI 정보 확인(비슷비슷하므로 N2만 진행)

ssh ec2-user@$N2 tree /var/log/aws-routed-eni 
ssh ec2-user@$N2 cat /var/log/aws-routed-eni/plugin.log | jq # IP 할당시 CIDR 32 확인
ssh ec2-user@$N2 cat /var/log/aws-routed-eni/ipamd.log | jq  # maxENI 5개, 할당된 IP 1개 확인
ssh ec2-user@$N2 cat /var/log/aws-routed-eni/egress-v4-plugin.log | jq # 

# 네트워크 정보 확인 : eniY는 pod network 네임스페이스와 veth pair 

ssh ec2-user@$N2 sudo ip -br -c addr 
ssh ec2-user@$N1 sudo ip -c addr 
ssh ec2-user@$N2 sudo ip -c route 
ssh ec2-user@$N1 sudo iptables -t nat -S # iptables 룰 확인
ssh ec2-user@$N2 sudo iptables -t nat -L -n -v 
```

## 데이터플레인(노드()의 기본 네트워크 정보 확인

- 가시다님이 제공해주신 장표와 함께 확인.  
- (coredns Pod 기준)AWS 웹콘솔에서 확인해보면, 2가지 IP가 있음.
  - 프라이빗 주소 IP: 컨트롤플레인의 IP주소
  - 보조 프라이빗 주소 IP: 데이터플레인에 Pod가 생성되면 바로 IP를 붙이기 위해 예약된 IP)
- 스크린샷에서는 veth 페어의 IP 주소는 `192.168.2.86`임을 확인.

```bash
# coredns 파드 IP 정보 확인
# 아래 스크린샷을 보면 알듯이 한국 리전 B존의 노드에 생성된 coredns 파드의 IP임을 알 수 있었다.

kubectl get pod -n kube-system -l k8s-app=kube-dns -owide

# 노드의 라우팅 정보 확인 >> EC2 네트워크 정보의 '보조 프라이빗 IPv4 주소'와 비교
# 웹 콘솔에서 한국 리전 B로 확인했으므로, N2의 정보를 확인.
# veth 페어의 IP 주소는 Pod의 IP 주소와 동일함.

ssh ec2-user@$N2 sudo ip -c route
```

### veth(v-eth, virtual ethernet interface)

- 단어를 보고 단박에 가상eth 인건 알았지만, 자세한 건 아래의 글을 통해서 알 수 있음.  
  - [44bits-veth](https://www.44bits.io/ko/keyword/veth)
- 아래까지 참고한다면, veth의 실제를 알 수 있을 것으로 판단.
  - [44bit-컨테이너 네트워크 기초 2편](https://www.44bits.io/ko/post/container-network-2-ip-command-and-network-namespace)

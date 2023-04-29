---
date: 2023-04-28T12:25:37+09:00
title: "AWS EKS 스터디 1주차"
tags:
 - AWS
 - EKS
 - CloudNet@
authors:
    - name: # 이름
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

최근 [CloudNet@](https://www.notion.so/gasidaseo/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 AWS EKS Workshop Study(이하, AEWS)에 참여하게 되었습니다.  

K8S가 워낙 인기가 많기도 하지만, 지난 kOps 스터디를 통해 관리요소가 참 많은 것을 느꼈었고,  
좀더 수월하게 이해를 해보고자 AWS 서비스인 EKS(Elastic Kubernetes Service)를 이번 기회에 살펴보기로 했습니다.  

## EKS 사용에 있어 고려사항

EKS는 관리형 서비스(managed service)이기에 아래와 같은 장점이 있습니다.  

- 클러스터링을 위한 Control Plane(일명, 마스터 노드)을 AWS에서 관리해줍니다.  
  - 워커노드는  
    1. 사용자가 AMI를 구성하여 이를 사용
    2. AWS에서 제공하는 Fargate로 **VM**을 할당하여 사용
- kOps와도 유사하지만, 다른 AWS 서비스와의 연동이 용이합니다.  
  개인적으로는 ACM의 인증서 사용에 있어 더 편할 것이라 생각을 했습니다.  
  1. ECR에 저장한 컨테이너 이미지를 활용가능
  2. IAM을 통한 권한 관리
  3. ELB를 통한 로드밸런싱
  4. VPC를 통한 네트워크 관리
- 오픈소스 k8s 기반이기에 EKS로의 용이한 마이그레이션

## API 서버 Cluster Endpoint 구성

- EKS는 Control Plane을 관리해주나, 마스터 노드에 접근이 필요한 경우가 있습니다.  
  이를 위해, Cluster Endpoint를 구성하여 마스터 노드에 접근할 수 있습니다.  
- [EKS Cluster Endpoint Access Control](https://docs.aws.amazon.com/eks/latest/userguide/cluster-endpoint.html)

- 아래와 같이 구분할 수 있습니다.
| Endpoint Public 액세스 | Endpoint Private 액세스 | Description |
| --- | --- | --- |
| Enabled | Disabled | 최초 기본 값, 퍼블릭 IP로 접속 |
| Enabled | Enabled | k8s API 요청은 AWS VPC 엔드포인트 사용 |
| Disabled | Enabled | 모든 트래픽이 AWS VPC 엔드포인트 사용 |  

- 3번째 구성이 권장. kubectl 명령이 모든 트래픽이 EKS에서 관리되는 ENI을 타게 됨.  

## EKS 배포해보기

- 스터디에서는 kOps 때와 같이 cloudformation 기반으로 배포.
- [source_code](https://github.com/awslabs/ec2-spot-labs/blob/master/ec2-spot-eks-solution/provision-worker-nodes/amazon-eks-nodegroup-with-spot.yaml)를 참조하여, spot instance를 사용하도록 템플릿 재구성을 하고 싶었으나, 아직 적용할 시점은 아니라고 생각되어 skip

- cloudformation 적용

```bash
aws cloudformation deploy --template-file ~/Documents/aews/myeks-1week.yaml \
     --stack-name myeks --parameter-overrides KeyName=aews SgIngressSshCidr=$(curl -s ipinfo.io/ip)/32 --region ap-northeast-2

![cloudformation](./images/1-cloudformation.png)

- 웹 콘솔에서도 확인 가능

![console](./images/2-host_instance.png)

# EC2 IP 출력
echo $(aws cloudformation describe-stacks --stack-name myeks --query 'Stacks[*].Outputs[*].OutputValue' --output text)

# EC2 SSH 접속
ssh -i ~/.ssh/aews.pem ec2-user@$(aws cloudformation describe-stacks --stack-name myeks --query 'Stacks[*].Outputs[*].OutputValue' --output text)
```

- 아래와 같이 정상적으로 접속된다.

![ssh](./images/3-ssh.png)

## EKS 호스트 확인

- cloudformation 템플릿에 적어둔 각 버전을 정상적으로 확인

```bash
kubectl version --client=true -o yaml | yh
eksctl version
aws --version
ls /root/.ssh/id_rsa*
docker info
```

- 아래와 같이 쿠버네티스 v1.25.7이 적용되었음을 알 수 있음

![host](./images/4-host_info.png)

##

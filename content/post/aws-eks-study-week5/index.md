---
date: 2023-05-22T19:23:37+09:00
title: "AWS EKS 스터디 5주차"
tags:
 - AWS
 - EKS
 - CloudNet@
 - autoscaling
 - karpenter
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.jpg # 커버 이미지 URL
draft: true # 글 초안 여부
---

이번 주차는 오토스케일링을 메인으로 하여, 수평/수직 프로비저닝을 학습해보았습니다.  
마지막에는 고성능 오토스케일러인 Karpenter를 별도로 실습해보았습니다.

- AutoScaling
  - HPA: Horizontal Pod Autoscaler
  - VPA: Vertical Pod Autoscaler
  - CA: Cluster Autoscaler
    - 각 CSP 의존적, 워커 노드 레벨에서의 오토스케일링

## 1. 실습 환경 배포

- 4주차의 초기 배포 내용에 p8s 및 Grafana를 추가하여 배포
  - **verticalPodAutoscaler 활성화**
  - 추천 대시보드: 15757, 17900, 15172

```bash
curl -O https://s3.ap-northeast-2.amazonaws.com/cloudformation.cloudneta.net/K8S/eks-oneclick4.yaml

# 이하 중략

## Prometheus & Grafana 설치

# 인증서 ARN
CERT_ARN=`aws acm list-certificates --query 'CertificateSummaryList[].CertificateArn[]' --output text`
echo $CERT_ARN

# 파라미터 파일 생성 및 배포
cat <<EOT > monitor-values.yaml
prometheus:
  prometheusSpec:
    podMonitorSelectorNilUsesHelmValues: false
    serviceMonitorSelectorNilUsesHelmValues: false
    retention: 5d
    retentionSize: "10GiB"

  verticalPodAutoscaler:
    enabled: true

  ingress:
    enabled: true
    ingressClassName: alb
    hosts: 
      - prometheus.$MyDomain
    paths: 
      - /*
    annotations:
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}, {"HTTP":80}]'
      alb.ingress.kubernetes.io/certificate-arn: $CERT_ARN
      alb.ingress.kubernetes.io/success-codes: 200-399
      alb.ingress.kubernetes.io/load-balancer-name: myeks-ingress-alb
      alb.ingress.kubernetes.io/group.name: study
      alb.ingress.kubernetes.io/ssl-redirect: '443'

grafana:
  defaultDashboardsTimezone: Asia/Seoul
  adminPassword: prom-operator

  ingress:
    enabled: true
    ingressClassName: alb
    hosts: 
      - grafana.$MyDomain
    paths: 
      - /*
    annotations:
      alb.ingress.kubernetes.io/scheme: internet-facing
      alb.ingress.kubernetes.io/target-type: ip
      alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}, {"HTTP":80}]'
      alb.ingress.kubernetes.io/certificate-arn: $CERT_ARN
      alb.ingress.kubernetes.io/success-codes: 200-399
      alb.ingress.kubernetes.io/load-balancer-name: myeks-ingress-alb
      alb.ingress.kubernetes.io/group.name: study
      alb.ingress.kubernetes.io/ssl-redirect: '443'

defaultRules:
  create: false
kubeControllerManager:
  enabled: false
kubeEtcd:
  enabled: false
kubeScheduler:
  enabled: false
alertmanager:
  enabled: false
EOT

kubectl create ns monitoring
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack --version 45.27.2 \
--set prometheus.prometheusSpec.scrapeInterval='15s' --set prometheus.prometheusSpec.evaluationInterval='15s' \
-f monitor-values.yaml --namespace monitoring

# Metric-server 배포
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### 1-1. EKS Node Viewer 설치

- 파드 리소스에 대한 요청 정보를 확인할 수 있는 대시보드
  - 해당 노드에 할당 가능한 용량을 시각적으로 표시
- 실제 사용량이 아니라, 요청된 리소스(CPU, Memory)에 대한 표시
- 실습 스책 상에서 go 설치 및 뷰어 설치시 다소 시간이 소요 (약 5분)
- Karpenter 실습 시에도 언급되겠지만, EKS가 구축된 뒤에 사용이 가능하다.

```bash
# go 및 EKS Node Viewer 설치
yum install -y go
go install github.com/awslabs/eks-node-viewer/cmd/eks-node-viewer@latest

# EKS Node Viewer 실행
tree ~/go/bin
cd ~/go/bin && ./eks-node-viewer

## EKS Node Viewer 명령 샘플
# Display both CPU and Memory Usage
./eks-node-viewer --resources cpu,memory

# Karenter nodes only
./eks-node-viewer --node-selector "karpenter.sh/provisioner-name"

# Display extra labels, i.e. AZ
./eks-node-viewer --extra-labels topology.kubernetes.io/zone

# Specify a particular AWS profile and region
AWS_PROFILE=myprofile AWS_REGION=ap-northeast-2

## 기본 옵션 환경 변수
# select only Karpenter managed nodes
node-selector=karpenter.sh/provisioner-name

# display both CPU and memory
resources=cpu,memory
```

## 2. Horizontal Pod Autoscaler - HPA

- kube-ops-view 및 Grafana(17125)에서 모니터링 병행
- php-apache 데모를 배포하여 진행
  - 마지막 부하 방법으로 해도, 워커노드가 10개까지 늘어나지 않음  
    HPA 조건이 CPU 50% 이기 때문에, 6~7개에서 유지됨

```bash
# CPU: 0.2코어 ~ 0.5코어(50%, 500m) 하한/상한 조건 설정
curl -s -O https://raw.githubusercontent.com/kubernetes/website/main/content/en/examples/application/php-apache.yaml
kubectl apply -f php-apache.yaml

# Pod 배포 후에 확인
kubectl exec -it deploy/php-apache -- cat /var/www/html/index.php

# 모니터링 준비
watch -d 'kubectl get hpa,pod;echo;kubectl top pod;echo;kubectl top node'
kubectl exec -it deploy/php-apache -- top

# 파드 특정 후 접속 테스트
PODIP=$(kubectl get pod -l run=php-apache -o jsonpath={.items[0].status.podIP}) && curl -s $PODIP; echo

## 셋업 설정 후 부하 발생
# HPA: requests.cpu=200m
kubectl autoscale deployment php-apache --cpu-percent=50 --min=1 --max=10
kubectl describe hpa

# 셋업 설정 확인: CPU 사용률 50%, Replicas 범위 1~10개
kubectl krew install neat
kubectl get hpa php-apache -o yaml | kubectl neat | yh

# 부하 발생, 두번째 방법이 더 부하가 많이 걸림
while true;do curl -s $PODIP; sleep 0.5; done
kubectl run -i --tty load-generator --rm --image=busybox:1.28 --restart=Never -- /bin/sh -c "while sleep 0.01; do wget -q -O- http://php-apache; done"

# 바로 밑의 실습 이후에 관련 오브젝트 삭제
kubectl delete deploy,svc,hpa,pod --all
```

### 2-1. HPA w/ multiple & custom metrics

- 위에서 워커노드 10개까지 scale-up 되지 않았기 때문에,
  추가로 메트릭을 넣고, 사용자 정의된 메트릭으로 부하 조건 충족을 목표
- 바로 위의 실습에서 이어서, 진행

```bash
# 위에서 정의된 HPA 오토스케일링 수정 작업을 진행
kubectl edit horizontalpodautoscaler.autoscaling
```

- 편집기에서 아래와 같이 `metrics:` 하위를 수정 후,  
  부하를 계속 발생하면, CPU 50% 이상을 충족하지 않았어도, 워커노드가 10개까지 늘어남
- describedObject: apiVersion, kind, name 을 지정하여,  
  해당 오브젝트의 메트릭을 **사용자 정의**로 지정할 수 있음

```yaml
# 전략
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
  - type: Pods
    pods:
      metric:
        name: packets-per-second
      target:
        type: AverageValue
        averageValue: 1k
  - type: Object
    object:
      metric:
        name: requests-per-second
      describedObject:
        apiVersion: networking.k8s.io/v1
        kind: Ingress
        name: main-route
      target:
        type: Value
        value: 10k
# 후략
```

## 3. k8s based Event Driven Autoscailing - KEDA

- HPA, KEDA 비교
  | HPA | KEDA |
  | --- | --- |
  | 리소스 기반 | 이벤트 기반 |

- 실습에서는 helm 차트를 통해 설치하고, Grafana 대시보드를 통해서 확인

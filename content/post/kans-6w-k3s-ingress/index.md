---
date: 2024-10-10T22:12:57+09:00
title: "제목"
title: "Kubernetes Service(3): Ingress(ingress-nginx) w/k3s"
tags:
 - kans
 - k3s
 - ingress
 - nginx
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

지난 포스팅, [Kubernetes Service(2): LoadBalancer(MetalLB)](https://blog.minseong.xyz/post/kans-5w-metallb-loadbalancer/)에 이어 Ingress Type을 가볍게 살펴보고, Ingress-Nginx를 가볍게 붙여보겠습니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 1. Ingress Type  

> 이제, 신규 기능(New feature)은 `Gateway API`에 추가된다고 합니다.  

우선, Kubernetes가 헷갈리는 것 중 하나가,  
- `Ingress Type 과 LoadBalancer Type의 명확한 차이가 뭘까...?`  
라는 점이라고 봅니다.  

물론, 그거 외에도 k8s에는 알쏭달쏭한 것들이 아-주 많지만요.  

친절한 [Docs](https://kubernetes.io/docs/concepts/services-networking/ingress/)에 따르면,  
클러스터 외부로 클러스터 내부 서비스에 대한 HTTP 및 HTTPS 라우팅을 노출하는 것이라고 합니다. 

Rules에 의한 다양한 백엔드 라우팅 외에도 Load Balancing, SSL Termination 그리고 name-based virtual hosting을 지원한다고 하는데... 이쯤되면 LoadBalancer Type이랑 다른게 없는 거라고 생각을 하곤 했습니다. 

그래서 Ingress를 잊어야한다는 마음으로, 차이점만 짚어보고자 했습니다. 

## 2. Ingress Type vs. LoadBalancer Type

- <https://www.baeldung.com/ops/kubernetes-ingress-vs-load-balancer>  

위의 링크가 먼저 나와서 슥 봤는데, 그 오해는 어디까지나 CSP에서 제공하는 ALB에 Routing Rule을 넣고 SSL을 달아서 헷갈린게 아닐까 생각을 해봤습니다. 

비용 같은 당연한 이야기는 빼고 해당 링크에서는 k8s 관점에서만 보면,  

- 어디까지나 LoadBalancer Type은 Service의 확장  
- Ingress와 달리, LB는 독립적 객체(Standalone Object)가 아님  

차이가 있다는 걸 알게되었습니다.  

## 3. 가벼운 k3s 실습 준비  

아직 Ingress Type의 관짝에 못이 안 박혔기 때문에, 가벼운 실습 준비를 해봅니다.  

> 이 또한 스터디에서 부트스트랩으로 제공되었기에 양해부탁드립니다.  

```bash  
# Install k3s-server
curl -sfL https://get.k3s.io | INSTALL_K3S_EXEC=" --disable=traefik"  sh -s - server --token kanstoken --cluster-cidr "172.16.0.0/16" --service-cidr "10.10.200.0/24" --write-kubeconfig-mode 644 

# Install k3s-agent
curl -sfL https://get.k3s.io | K3S_URL=https://192.168.10.10:6443 K3S_TOKEN=kanstoken  sh -s -
```  

`kubeadm`을 많이 다루신 현업 분들께서는 좀 많이 익숙한 파라미터들이 보입니다.  
다만, `--disable=traefik`이라는 파라미터가 k3s server 설치 스크립트에서 볼 수 있는데요,  
k3s가 Ingress Controller로 Traefik을 사용하는데, Ingress-Nginx를 사용하기 위해 Traefik을 비활성화 시키는 것입니다.  

```bash
(⎈|default:N/A) root@k3s-s:~# cat /etc/rancher/k3s/k3s.yaml
apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: LS0tLS1CR(중략)LS0tLS0K
    server: https://127.0.0.1:6443
  name: default
contexts:
- context:
    cluster: default
    user: default
  name: default
current-context: default
kind: Config
preferences: {}
users:
- name: default
  user:
    client-certificate-data: LS0tLS1C(중략)LS0tLS0K
    client-key-data: LS0tLS1(중략)LS0tLQo=
```

k3s는 `SUSE`및 `Rancher`에서 개발되어, CNCF Sandbox Project로 등록되어있는,  
IoT & Edge Computing을 위한 k8s 배포도구이기에 rancher 폴더가 생겼음을 유추해볼 수 있습니다.  

## 4. Ingress-Nginx 컨트롤러 배포 (Helm)  

> 제가 조작하지 않는, Helm에 데인 이후로 선호도가 급?격하게 떨어지긴 했는데, 여튼 편하니까 해봅시다.   

### (a) Helm Values 파일 작성 및 Helm Repo 추가  

- NodePort로 해당 서비스를 노출하기로 해봅시다.  

```bash
cat <<EOT> ingress-nginx-values.yaml
controller:
  service:
    type: NodePort
    nodePorts:
      http: 30080
      https: 30443
  nodeSelector:
    kubernetes.io/hostname: "k3s-s"
  metrics:
    enabled: true
  serviceMonitor:
      enabled: true
EOT

helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
```

`insecure` warning이 뜨지만, 이게 학습이라 그저 넘어가도록 합시다.  

```bash
WARNING: Kubernetes configuration file is group-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
WARNING: Kubernetes configuration file is world-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
"ingress-nginx" has been added to your repositories
WARNING: Kubernetes configuration file is group-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
WARNING: Kubernetes configuration file is world-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
```

### (b) ns 생성 및  Helm Chart 배포  

```bash
kubectl create ns ingress
helm install ingress-nginx ingress-nginx/ingress-nginx -f ingress-nginx-values.yaml --namespace ingress --version 4.11.2

# Check
kubectl get all -n ingress
kubectl get svc -n ingress ingress-nginx-controller
```

`Warning`은 에?러가 아니니까, 대개 잘 잡히는 것 같습니다.  

```bash
(⎈|default:N/A) root@k3s-s:~# kubectl create ns ingress
helm install ingress-nginx ingress-nginx/ingress-nginx -f ingress-nginx-values.yaml --namespace ingress --version 4.11.2
namespace/ingress created
WARNING: Kubernetes configuration file is group-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
WARNING: Kubernetes configuration file is world-readable. This is insecure. Location: /etc/rancher/k3s/k3s.yaml
NAME: ingress-nginx
LAST DEPLOYED: Thu Oct 10 23:39:48 2024
NAMESPACE: ingress
STATUS: deployed
REVISION: 1
TEST SUITE: None
NOTES:
The ingress-nginx controller has been installed.
Get the application URL by running these commands:
  export HTTP_NODE_PORT=30080
  export HTTPS_NODE_PORT=30443
  export NODE_IP="$(kubectl get nodes --output jsonpath="{.items[0].status.addresses[1].address}")"

  echo "Visit http://${NODE_IP}:${HTTP_NODE_PORT} to access your application via HTTP."
  echo "Visit https://${NODE_IP}:${HTTPS_NODE_PORT} to access your application via HTTPS."

An example Ingress that makes use of the controller:
  apiVersion: networking.k8s.io/v1
  kind: Ingress
  metadata:
    name: example
    namespace: foo
  spec:
    ingressClassName: nginx
    rules:
      - host: www.example.com
        http:
          paths:
            - pathType: Prefix
              backend:
                service:
                  name: exampleService
                  port:
                    number: 80
              path: /
    # This section is only required if TLS is to be enabled for the Ingress
    tls:
      - hosts:
        - www.example.com
        secretName: example-tls

If TLS is enabled for the Ingress, a Secret containing the certificate and key must also be provided:

  apiVersion: v1
  kind: Secret
  metadata:
    name: example-tls
    namespace: foo
  data:
    tls.crt: <base64 encoded cert>
    tls.key: <base64 encoded key>
  type: kubernetes.io/tls
```

상태도 잘 잡힌거 같으니, 일단 여기서 잠시 쉬겠습니다. 


```bash
NAME                                           READY   STATUS    RESTARTS   AGE
pod/ingress-nginx-controller-979fc89cf-lk7th   1/1     Running   0          92s

NAME                                         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
service/ingress-nginx-controller             NodePort    10.10.200.235   <none>        80:30080/TCP,443:30443/TCP   92s
service/ingress-nginx-controller-admission   ClusterIP   10.10.200.100   <none>        443/TCP                      92s
service/ingress-nginx-controller-metrics     ClusterIP   10.10.200.234   <none>        10254/TCP                    92s

NAME                                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/ingress-nginx-controller   1/1     1            1           92s

NAME                                                 DESIRED   CURRENT   READY   AGE
replicaset.apps/ingress-nginx-controller-979fc89cf   1         1         1       92s
NAME                       TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)                      AGE
ingress-nginx-controller   NodePort   10.10.200.235   <none>        80:30080/TCP,443:30443/TCP   92s
```
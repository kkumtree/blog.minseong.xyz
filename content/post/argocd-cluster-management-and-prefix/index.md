---
date: 2025-11-22T20:56:43+09:00
title: "ArgoCD Cluster 및 Prefix 관리 - CI/CD 스터디 6주차"
tags:
  - argocd
  - CICD
  - CloudNet@
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: image-11.png # 커버 이미지 URL
draft: false # 글 초안 여부
---

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 CI/CD Study 6주차에는 ArgoCD를 마지막으로 다루었습니다.  
Cluster를 추가해보고 Gitea를 붙이기 전에, ArgoCD를 Prefix로 라우팅하려고 했는데 로그아웃하고 나서 원치않는 경로로 빠지는 바람에  
이것저것 살펴보고 수정을 하여 원하는 대로 구동되도록 셋업했습니다.  

## 0. 실습 준비  

> 해당 구성들은 아래 GitHub에 탑재되어 있습니다.  
> <https://github.com/kkumtree/ci-cd-cloudnet-study> 의 6w 폴더  

이전 포스팅 [Tailscale을 타고, ArgoCD에 접근해보기](../playing-argocd-with-tailscale/)을 하였다면, 리소스 정리를 합니다.  

> kind 배포 시, 포트 점유로 오류가 발생합니다.  

```bash
sudo tailscale serve --tcp 443 off
```

![disable tailscale tcp 443 serve](image.png)  

이후 실습을 위한 배포를 합니다.  

### (1) kind 클러스터 배포  

이번 실습에서는 k8s 다중 클러스터 환경에서의 ArgoCD를 다루기에,  
총 3개의 클러스터를 배포합니다.  

(6w/shells/kind/)  

1. up-kind-mgmt.sh 실행  
   - kind 클러스터, mgmt 생성  
   - ingress-nginx 배포  
   - ingress-nginx에 SSL passthrough 활성화  
2. up-kind-dev-prd.sh 실행
   - kind 클러스터, dev 생성  
   - kind 클러스터, prd 생성  

![provisioning mgmt kind cluster](image-1.png)  
![provisioning dev, prd kind cluster](image-2.png)  

이후 아래 3개의 context를 확인할 수 있습니다.  
(`kubectl config get-contexts`, k9s의 경우 `:ctx`)  

- kind-mgmt / kind-prd / kind-dev  

![confirm three contexts in host](image-4.png)

### (2) ArgoCD 배포(mgmt)  

Tailscale 연동이 재밌었기 때문에, 이번엔 이쪽[sol.2]으로 합니다.  

**[sol.1] `/etc/hosts` 파일을 변경하여 접근하도록 하는 방법**  

(6w/shells/argocd/)  

1. `9-create-local-tls.sh` 실행  
2. `deploy-chart.sh` 실행  
   - `kind-mgmt`로 context 전환
   - ArgoCD 배포

> 아래처럼 `/etc/hosts` 파일도 수정하여, 임의의 도메인을 추가합니다.  

```bash
# (Mac/Linux)  
echo "127.0.0.1 argocd.example.com" | sudo tee -a /etc/hosts
cat /etc/hosts
# (Windows)  
# C:\Windows\System32\drivers\etc\hosts 관리자모드에서 메모장에 내용 추가
# 127.0.0.1 argocd.example.com
```

![edit etc hosts file](image-3.png)  

**[sol.2] Tailscale 로 접근하도록 하는 방법**  

> 이전 포스팅 [Tailscale을 타고, ArgoCD에 접근해보기](../playing-argocd-with-tailscale/)을 참고하여 각자의 DNS로 변경 후 실행합니다.  

(6w/shells/tailnet-argocd)  

- tailnet에 등록된 해당 hostname 확인: 두 번째 값  
  `tailscale status | head -n 1`  
- tailnet DNS 확인: `Search Domains:`의 항목 확인  
  `sudo tailscale dns status`  
- `create-local-tls.sh` 파일을 확인된 값으로 변경 후, 실행  
- `deploy-chart.sh` 파일을 확인된 값으로 변경 후, 실행  
  - `kind-mgmt`로 context 전환
  - ArgoCD 배포

![deploy argocd chart with tls](image-5.png)

이후에 아래 커맨드로 Tailscale serve를 활성화 합니다.  

```bash
sudo tailscale serve --bg --tcp 443 tcp://localhost:443
```

### (3) ArgoCD 초기 패스워드 변경  

ArgoCD 권장 사항으로 패스워드 변경 후, 초기 패스워드는 제거합니다.  

```bash
ARGOPW=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d ;echo)  
# argocd login argocd.example.com --insecure --username admin --password $ARGOPW
argocd login kkumtree-ms-7a34.panda-ule.ts.net --insecure --username admin --password $ARGOPW  
# 사용자 지정 패스워드로 변경  
argocd account update-password --current-password $ARGOPW --new-password kkumtree  
# (권장) 초기 비밀번호 제거  
kubectl delete secret argocd-initial-admin-secret -n argocd  
```  

![change admin password and delete initial password](image-6.png)  

이후, 변경된 패스워드로 로그인을 확인합니다.  

![login with new password](image-7.png)

## 1. ArgoCD 클러스터 관리  

ArgoCD가 배포된 클러스터 외의 클러스터들은 별도로 ArgoCD에 등록하여야합니다.  

이에 앞서, kind를 위한 설정과 Alias 등록을 해두겠습니다.  

### (1) kind를 위한 설정 및 Alias 등록

kind는 Docker위에서 구동되는 것이기에,  
kind가 사용중인 Docker 네트워크와 Docker 포트포워딩 정보를 확인해야합니다.  

> 실습 환경 별로, 사용 중인 네트워크 정보는 달라질 수 있습니다.  
> 또한 호스트 재부팅 시 각 Docker Network내 IP가 변경될 수 있으니, 확인하여 변경하여야 합니다.  

6443 포트를 사용하고 있고 네트워크는 172.16.0.0/16 대역을 사용 중인 것을 확인하였습니다.  

```bash
docker ps
docker network inspect kind | grep -E 'Name|IPv4Address'
```  

![docker network which kind is in-use](image-8.png)  

이후, 각 cluster별로 확인된 IP주소로 변경합니다. (`vi ~/.kube/config`)  

![change address in kube config](image-9.png)

```bash
alias kctx-mgmt='kubectl --context kind-mgmt'
alias kctx-dev='kubectl --context kind-dev'
alias kctx-prd='kubectl --context kind-prd'
```

### (2) 클러스터 등록  

아래 커맨드를 입력한 다음, y로 승인하여 등록 절차를 밟습니다.  

```bash
argocd cluster add kind-dev --name dev-k8s
argocd cluster add kind-prd --name prd-k8s
```

![register clusters with argocd cli](image-10.png)  

등록이 되었는지 확인해봅니다.  
클러스터의 자격증명은 `argocd.argoproj.io/secret-type=cluster`과 함께 시크릿으로 저장됩니다.  

```bash
kubectl get secret -n argocd -l argocd.argoproj.io/secret-type=cluster
argocd cluster list
```

![check registered clusters](image-11.png)

## 2. ArgoCD Prefix 재적용  

Gitea도 같이 띄우기 위해서, ArgoCD 진입점을 Prefix `/_argocd` 로 변경을 해보겠습니다.  

추가로 설정한 값은 아래와 같습니다.  

특히, 로그아웃 시 지정한 Prefix로 리디렉션되지 않아 `configs.cm.url`을 사용자 정의했습니다.  
추정컨대, SSO 설정을 하려면 필수적으로 필요한 값이라 로직상 사소한 버그는 놔둔 것으로 보입니다.

![set url in argocd-cm](image-17.png)

```yaml
configs.params.server.basehref: "/<Prefix>"   # Reverse Proxy 사용 시, 하위 경로가 다를 때 사용. 웹콘솔의 index.html 경로 정의
configs.params.server.rootpath: <Prefix>/     # Reverse Proxy 사용 시, 하위 경로가 다를 때 사용.  
configs.cm.url: "https://<DOMAIN>/<Prefix>"   # Logout 시, ArgoCD 메인페이지로 가지 못하는 이슈가 있어, 수동으로 지정  
server.ingress.path: /</Prefix>/              # 마지막에 `/` 추가하지 않으면 에러발생 확인.  
server.ingress.pathType: Prefix               # ImplementationSpecific로 할 경우, Prefix 뿐만이 아니고 Domain 최상위 경로도 점유하는 것으로 확인  
```

`configs` 네임스페이스에 정의된 사항은 ConfigMap `argocd-cmd-parmas-cm` 과 `argocd-cm` 에서 확인할 수 있습니다.  

```bash
kubectl get cm -n argocd  
kubectl describe cm/argocd-cmd-params-cm -n argocd | grep -E 'server.basehref|server.rootpath' -A 2  
```  

![argocd configmap](image-15.png)  

1. 네임스페이스 argocd 제거  
2. `deploy-chart-prefix.sh` 실행 (로컬 TLS 인증서 없는 경우, 생성 후 진행)  
3. 명령어로 지정한 Prefix로 정상 접근되는 지 점검: Prefix 마지막에 `/` 추가  
4. 이후, 로그인 재설정 및 클러스터 재등록을 진행했습니다.  

하지만, 네임스페이스를 지우면 TLS 인증서와 cluster 등록을 반복했어야 해서  
디버깅 중에는 helm 업그레이드로 진행했습니다.  

```bash
helm upgrade argocd -n argocd argo/argo-cd --values argocd-values-tailnet-prefix.yaml
```

아래 명령어로 정상 접근되는지 확인합니다.  

```bash  
# curl -k https://<DOMAIN>/<Prefix>/  
curl -k https://kkumtree-MS-7A34.panda-ule.ts.net/_argocd/
```  

![check after prefix added argocd](image-14.png)

로그인 시에는 다음과 같이 `--grpc-web-root-path /<Prefix>` 파라미터를 추가하여 접속합니다.  

```bash  
#  ARGOPW=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d ;echo)
argocd login kkumtree-ms-7a34.panda-ule.ts.net --grpc-web-root-path /_argocd --insecure --username admin --password $ARGOPW
#  argocd account update-password --current-password $ARGOPW --new-password kkumtree
argocd login kkumtree-ms-7a34.panda-ule.ts.net --grpc-web-root-path /_argocd --insecure --username admin --password kkumtree
#  kubectl delete secret argocd-initial-admin-secret -n argocd
```

![argocli usage with custom prefix path](image-16.png)  

<!-- ## 3. Tailscale Kubernetes Operator 설치  

생각해보니, ArgoCD가 네트워크 내부의 Gitea를 읽으려면 Host 뿐만이 아니라, kind 내부에도 설치를 해야합니다.  

> <https://tailscale.com/kb/1486/kubernetes-operator-multi-cluster-argocd>  

그 전에 Tailscale ACL부터 설정해보겠습니다.  

### (1) Tag 생성

> (Visual editor 기준)
> Access controls > Tags  

아래처럼 `k8s-operator` 및 `k8s` 태그를 생성하고,  
`k8s` 태그 소유자(tagOwners)는 `k8s-operator`로 지정합니다.  

![tailscale Access Control](image-18.png)

### (2) OAuth키 발급  

> Settings > Trust credentials > + Credential  

먼저 아래의 형태를 갖습니다. 계정별로 고유합니다.  

```yaml
OAuth client ID: "k123456CNTRL"
OAuth client secret: "tskey-client-k123456CNTRL-abcdef"
```

아래 화면에서 `+ Credential` 클릭

![tailscale trust credential](image-19.png)

`New credential`에서 OAuth 선택 확인 후, Continue.  

Write 권한은 아래 두 가지를 지정하며,  
tag는 앞서 지정한 `k8s-operator`로 설정합니다.  

- Devices > Core  
- Keys > Auth Keys  

![Set scope with tag](image-20.png)

생성 버튼을 누르면 모달창이 뜨는데, 닫으면 조회가 안되므로 메모해둡니다.  

### (3) 배포  

(6w/shells/tailscale-operator/)

```bash
TAIL_OAUTH_CLIENT_ID=k123456CNTRL 
TAIL_OAUTH_CLIENT_SECRET=skey-client-k123456CNTRL-abcdef

TAIL_OAUTH_CLIENT_ID=$TAIL_OAUTH_CLIENT_ID TAIL_OAUTH_CLIENT_SECRET=$TAIL_OAUTH_CLIENT_SECRET ./deploy-chart.sh
```

![deploy tailscale operator](image-21.png)

정상적으로 배포되었다면, 기기 등록 페이지에서도 확인됩니다.  

![check operators are registered](image-22.png)

### (4) MagicDNS(tailnet) 사용 설정  

Tailscale의 dnsconfig 리소스를 활용하여, coredns에 추가하여야 합니다.  

```bash
./deploy-ts-dns.sh
```

해당 스크립트에는 

- dnsconfig 리소스 생성
- coredns에 ts.net을 위한 DNS정보 추가

![deploy ts dns](image-23.png) -->

## 9. Host 재부팅 시, Unhandled Error  

![Unhandled Error after reboot](image-12.png)

재부팅 후 kubectl 명령어 입력 시 kind 클러스터, 즉 Docker pod의 Docker network 상의 IP주소가 변경되므로 `1-(1) kind를 위한 설정 및 Alias 등록`을 참조하여 `~/.kube/config` 설정을 업데이트 합니다.  

더불어 ArgoCD 클러스터도 재등록 해야합니다.  

- 기존 클러스터 제거: `argocd cluster rm <CLUSTER NAME>`  

![re-assign clusters with argocd cli](image-13.png)  

## Reference  

- [argocd-cmd-params-cm.yaml/GitHub](https://github.com/argoproj/argo-cd/blob/master/docs/operator-manual/argocd-cmd-params-cm.yaml)  
- [url in argocd-cm.yaml/GitHub](https://github.com/argoproj/argo-cd/blob/d5fee5a18af39b71b151d306b973956dadded7e4/docs/operator-manual/argocd-cm.yaml#L11)  
- [logoutRedirectURL in logout.go](https://github.com/argoproj/argo-cd/blob/d5fee5a18af39b71b151d306b973956dadded7e4/server/logout/logout.go#L73)  

---
date: 2024-09-18T20:52:16+09:00
title: "제목"
tags:
 - tag1
 - tag2
authors:
    - name: # 이름
      bio: # 자기소개
      email: example@example.com # Email
      launchpad: hello # Launchpad Username
      github: hello # GitHub Username
      profile: profile.jpg # 프로필 이미지 URL
image: cover.png # 커버 이미지 URL
draft: true # 글 초안 여부
---

Contents here...



## 3. Retina 설치  <재구성 필요>

> Network Monitoring Tool인 [Retina](https://github.com/microsoft/retina)를 설치해봅니다.  

- Helm이 있어야합니다. 공식 Docs가 제일 정확합니다.  

### (1) Helm chart 설치  

- 링크: <https://retina.sh/docs/Installation/Setup>  

Basic Mode 로 진행해보겠습니다.  
  
```bash  
# Set the version to a specific version here or get latest version from GitHub API.
VERSION=$( curl -sL https://api.github.com/repos/microsoft/retina/releases/latest | jq -r .name)
helm upgrade --install retina oci://ghcr.io/microsoft/retina/charts/retina \
    --version $VERSION \
    --set image.tag=$VERSION \
    --set operator.tag=$VERSION \
    --set logLevel=info \
    --set enabledPlugin_linux="\[dropreason\,packetforward\,linuxutil\,dns\]"
```  

다음과 같은 출력값이 나옵니다.  

```bash  
Release "retina" does not exist. Installing it now.
Pulled: ghcr.io/microsoft/retina/charts/retina:v0.0.16
Digest: sha256:384e4b45d37ab49b6e2e742012e3d49230ce2be102895dccb504b42540091419
NAME: retina
LAST DEPLOYED: Sun Sep 15 19:29:03 2024
NAMESPACE: default
STATUS: deployed
REVISION: 1
NOTES:
1. Installing retina service using helm: helm install retina ./deploy/legacy/manifests/controller/helm/retina/ --namespace kube-system --dependency-update
2. Cleaning up/uninstalling/deleting retina and dependencies related: 
```  

### (2) Prometheus 설치  

앞서 출력값의 NOTES.1을 그대로 치면 에러가 정상적으로 나야합니다. 해당 되는 파일을 받지 않았기 때문입니다.  

- 에러 로그를 보면, 이 또한 Document를 안내하는 것을 알 수 있습니다.  https://github.com/microsoft/retina/blob/3d2c7a55f8c0388df271453f5fc7b166c2f275be/deploy/legacy/prometheus/values.yaml

- Prometheus 커뮤니티 차트를 사용합니다. Legacy 모드로 진행하나, Github를 살펴보니 Hubble을 쓰는 방식도 있는 것 같습니다.  

- 앞서 언급된 파일의 경로: <https://github.com/microsoft/retina/blob/3d2c7a55f8c0388df271453f5fc7b166c2f275be/deploy/legacy/prometheus/values.yaml>  

    ```bash
    (⎈|HomeLab:default) root@k8s-m:~/retina# mkdir -p deploy/legacy/prometheus
    (⎈|HomeLab:default) root@k8s-m:~/retina# touch deploy/legacy/prometheus/values.yaml
    (⎈|HomeLab:default) root@k8s-m:~/retina# helm install prometheus -n kube-system -f deploy/legacy/prometheus/values.yaml prometheus-community/kube-prometheus-stack
    NAME: prometheus
    LAST DEPLOYED: Sun Sep 15 19:59:33 2024
    NAMESPACE: kube-system
    STATUS: deployed
    REVISION: 1
    NOTES:
    kube-prometheus-stack has been installed. Check its status by running:
      kubectl --namespace kube-system get pods -l "release=prometheus"

    Visit https://github.com/prometheus-operator/kube-prometheus for instructions on how to create & configure Alertmanager and Prometheus instances using the Operator.
    ```

- <에러남> 안내서에 따라 접속을 위해 Port-Forward 설정한 후 링크를 얻습니다.  
  - 다만, 해당 명령어는 foreground로 실행하는 것이기에 새로운 터미널에서 하는 것을 권장합니다.  

    ```bash
    # Ternimal 1
    kubectl port-forward --namespace kube-system svc/prometheus-operated 9090
    # Terminal 2
    echo -e "kubeskoop URL = http://$(curl -s ipinfo.io/ip):9090"
    ```
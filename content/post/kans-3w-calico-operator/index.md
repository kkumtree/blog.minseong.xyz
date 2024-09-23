---
date: 2024-09-18T20:52:16+09:00
title: "Calico Installation in Operator Mode"
tags:
  - kans  
  - cni
  - calico    
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

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

스터디 진행 시, Manifests를 사용하여 Calico를 설치하였으나,  
Operator를 사용하여 설치하는 방법을 정리합니다.  

과제는 아니었지만, 요새 다들 Operator Framework를 사용해서 마라샹궈 볶듯이  
Operator를 지지고 볶는 것 같아서 호기심에 정리해보았습니다.  

참고로 Manifests를 사용하여 설치 시, 50개의 노드[1]를 초과하는 경우 Typha를 구성하여야 합니다.

> Calico 설치 환경 : AWS EC2(No EKS), kubeadm[2], pod-network-cidr=172.16.0.0/16, IPIP Mode  

## 1. Calico Routing Mode  

위에 언급된 IPIP Mode를 이해하려면 Calico의 Routing Mode를 훑을 필요성이 있었습니다.  
파드간 통신 시 노드 간에 encapsulation의 전략을 기준으로 나뉘어 볼 수 있겠습니다.  

- IPIP Mode: (tunl interface)  
  IP header로 감싸(encapsulate)서 다시 Outer header를 제거하는 방식.  
- VXLAN Mode: (vxlan interface)  
  UDP header로 감싸서 다시 Outer header를 제거하는 방식.  
- Direct Mode: 원본 패킷 그대로. CSP의 경우 NIC에서 Src/Dest Check 기능 Disable 필요.  

그 외에도 (Network Level)Pod traffic Encryption[3] 이 있습니다.  

Azure에서는 VNet에서 IPIP가 차단됩니다. 사실 IPIP Mode로 구성할 경우, CSP레벨이 아닌 Kubeadm 등에서 지정한 pod network cidr같은 사용자 정의 값을 고려해야하여 관리적 측면에서 이슈가 되기에, VXLAN Mode를 사용하는 것이 여러모로 좋아보입니다. 물론 이거도 Azure 쓸 때 해봐야 겠지요.  

## 2. Calico Operator 설치 및 설정  

Docs: [Install Calico/Operator](https://docs.tigera.io/calico/latest/getting-started/kubernetes/self-managed-onprem/onpremises)

그냥 쓱쓱 읽으면, Operator를 위한 CRD 설치 및 Custom 설정만 적용하면 됩니다.  
그게 끝이고 그게 문제입니다(?).  

### (1) CRD 설치

원래 파일을 받아서 적용하는 걸 좋아하는데...  
직접 해보니, 이건 얌전히 create를 추천드립니다. 살짝 당황스러웠습니다.  

```bash
# SET CALICO_VERSION_NAME  
# ref. https://github.com/projectcalico/calico/tags
CALICO_VERSION_TAG=v3.28.2 && echo $CALICO_VERSION_TAG
# v3.28.2  
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION_TAG}/manifests/tigera-operator.yaml
```  

`tigera-operator` Namespace 및 CRD, SA, Deployment가 생성됩니다.  

하지만, CoreDNS의 상태는 ~~당연히~~ 아직 Pending입니다.  

```bash
(⎈|HomeLab:default) root@k8s-m:~# kubectl get pod -n kube-system
NAME                            READY   STATUS    RESTARTS   AGE
coredns-55cb58b774-62vtz        0/1     Pending   0          21m
coredns-55cb58b774-l8znv        0/1     Pending   0          21m
```

### (2) Custom 설정 적용

> 수정에 있어 `yq`를 사용하였습니다. [mikefarah/yq](https://github.com/mikefarah/yq)  

아래와 같이 custom-resource.yaml 파일을 받아, Calico 구성[4]을 합니다.  

```bash
curl https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION_TAG}/manifests/custom-resources.yaml -sSo custom-resources-$(date --iso-8601).yaml  
ls | grep custom-resources
# custom-resources-2024-09-22.yaml
```

주로 수정되는 부분은 `calicoNetwork.ippools`의 `blockSize`와 `cidr`, `encapsulation`입니다.  

```bash
# mikefarah/yq pre-installed
yq '(select(.kind == "Installation") | .spec.calicoNetwork.ipPools[0] | (.blockSize, .cidr, .encapsulation))' custom-resources-2024-09-22.yaml
26
192.168.0.0/16
VXLANCrossSubnet
```

- blockSize: IP Pool의 크기, 26은 64개의 IP이므로 24(256개)로 변경합니다.
- cidr: kubeadmin init 시 설정한 pod-network-cidr
- encapsulation[5]: 아래 중 하나를 고를 수 있습니다.  
  - IPIP, VXLAN, IPIPCrossSubnet, VXLANCrossSubnet, None(Optional)

```bash



### (참고) Manifests 기본 설정값 둘러보기

잠시 Manifests 설치 방식을 살펴보겠습니다.  
v3.28.2 버전 기준, `L4924-4935`를 살펴보면, 
IPIP Mode가 기본 활성화 되어있음을 알 수 있습니다.  

```bash  
curl https://raw.githubusercontent.com/projectcalico/calico/v3.28.2/manifests/calico.yaml -sSq | sed -n '4924,4935p'
```  

```yaml  
# Auto-detect the BGP IP address.
- name: IP
  value: "autodetect"
# Enable IPIP
- name: CALICO_IPV4POOL_IPIP
  value: "Always"
# Enable or Disable VXLAN on the default IP pool.
- name: CALICO_IPV4POOL_VXLAN
  value: "Never"
# Enable or Disable VXLAN on the default IPv6 IP pool.
- name: CALICO_IPV6POOL_VXLAN
  value: "Never"
```  

[1] <https://docs.tigera.io/calico/latest/getting-started/kubernetes/self-managed-onprem/onpremises#install-calico-with-kubernetes-api-datastore-more-than-50-nodes>
[2] <https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/#options>
[3] <https://docs.tigera.io/calico/latest/network-policy/encrypt-cluster-pod-traffic>
[4] <https://docs.tigera.io/calico/latest/reference/installation/api#operator.tigera.io/v1.IPPool>
[5] <https://docs.tigera.io/calico/latest/reference/installation/api#operator.tigera.io/v1.EncapsulationType>
 


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
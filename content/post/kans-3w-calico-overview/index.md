---
date: 2024-09-15T18:40:22+09:00
title: "Calico 및 Retina 설치 구성"
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
image: cover.png
draft: true
---

## 1. Calico 설치  

> 스터디에서 AWS CF 및 Calico 설치 스크립트를 제공하였기에, 이 부분은 참고만 하시기 바랍니다.  

CNI가 설치되지 않았기에 NotReady 상태에 있다가, Calico 설치하면 CoreDNS가 설정되며, Ready 상태로 변경된다.  

- Calico 설치 전  

    ```bash
    # Control Plane and worker nodes are not ready
    (⎈|HomeLab:default) root@k8s-m:~# kubectl get nodes
    NAME     STATUS     ROLES           AGE   VERSION
    k8s-m    NotReady   control-plane   32m   v1.30.5
    k8s-w0   NotReady   <none>          31m   v1.30.5
    k8s-w1   NotReady   <none>          31m   v1.30.5
    k8s-w2   NotReady   <none>          31m   v1.30.5

    # Count for iptalbes rules for comparison
    (⎈|HomeLab:default) root@k8s-m:~# iptables -t filter -L | wc -l
    50
    (⎈|HomeLab:default) root@k8s-m:~# iptables -t nat -L | wc -l
    48
    ```  

    ```bash
    (⎈|HomeLab:default) root@k8s-m:~# kubectl get pod -A --sort-by=.metadata.creationTimestamp
    NAMESPACE     NAME                            READY   STATUS    RESTARTS   AGE
    kube-system   etcd-k8s-m                      1/1     Running   0          35m
    kube-system   kube-apiserver-k8s-m            1/1     Running   0          35m
    kube-system   kube-controller-manager-k8s-m   1/1     Running   0          35m
    kube-system   kube-scheduler-k8s-m            1/1     Running   0          35m
    kube-system   coredns-55cb58b774-bscbt        0/1     Pending   0          35m
    kube-system   coredns-55cb58b774-w22zq        0/1     Pending   0          35m
    kube-system   kube-proxy-5hgmn                1/1     Running   0          35m
    kube-system   kube-proxy-bnv77                1/1     Running   0          35m
    kube-system   kube-proxy-xf8q7                1/1     Running   0          35m
    kube-system   kube-proxy-hzsnk                1/1     Running   0          35m
    ```

-  Calico 설치 후  

    ```bash
    (⎈|HomeLab:default) root@k8s-m:~# kubectl get nodes
    NAME     STATUS   ROLES           AGE   VERSION
    k8s-m    Ready    control-plane   45m   v1.30.5
    k8s-w0   Ready    <none>          45m   v1.30.5
    k8s-w1   Ready    <none>          45m   v1.30.5
    k8s-w2   Ready    <none>          45m   v1.30.5
    (⎈|HomeLab:default) root@k8s-m:~# iptables -t filter -L | wc -l
    210
    (⎈|HomeLab:default) root@k8s-m:~# iptables -t nat -L | wc -l
    126
    ```

    ```bash
    (⎈|HomeLab:default) root@k8s-m:~# kubectl get pod -A --sort-by=.metadata.creationTimestamp
    NAMESPACE     NAME                                       READY   STATUS    RESTARTS   AGE
    kube-system   etcd-k8s-m                                 1/1     Running   0          37m
    kube-system   kube-scheduler-k8s-m                       1/1     Running   0          37m
    kube-system   kube-controller-manager-k8s-m              1/1     Running   0          37m
    kube-system   kube-apiserver-k8s-m                       1/1     Running   0          37m
    kube-system   coredns-55cb58b774-w22zq                   1/1     Running   0          36m
    kube-system   coredns-55cb58b774-bscbt                   1/1     Running   0          36m
    kube-system   kube-proxy-5hgmn                           1/1     Running   0          36m
    kube-system   kube-proxy-bnv77                           1/1     Running   0          36m
    kube-system   kube-proxy-xf8q7                           1/1     Running   0          36m
    kube-system   kube-proxy-hzsnk                           1/1     Running   0          36m
    kube-system   calico-node-xsqfv                          1/1     Running   0          57s
    kube-system   calico-node-ttxcv                          1/1     Running   0          57s
    kube-system   calico-node-6x5zq                          1/1     Running   0          57s
    kube-system   calico-kube-controllers-77d59654f4-vl8sv   1/1     Running   0          56s
    kube-system   calico-node-cqjxm                          1/1     Running   0          56s
    ```

- Calico 설치 스크립트를 통해 아래와 같은 변화가 주어집니다. 이외에도 Calico 사용을 위해 [calicoctl](https://docs.tigera.io/calico/latest/operations/calicoctl/install#install-calicoctl-as-a-binary-on-a-single-host) 을 설치했습니다.  

    ```bash  
    poddisruptionbudget.policy/calico-kube-controllers created
    serviceaccount/calico-kube-controllers created
    serviceaccount/calico-node created
    serviceaccount/calico-cni-plugin created
    configmap/calico-config created
    customresourcedefinition.apiextensions.k8s.io/bgpconfigurations.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/bgpfilters.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/bgppeers.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/blockaffinities.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/caliconodestatuses.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/clusterinformations.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/felixconfigurations.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/globalnetworkpolicies.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/globalnetworksets.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/hostendpoints.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/ipamblocks.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/ipamconfigs.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/ipamhandles.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/ippools.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/ipreservations.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/kubecontrollersconfigurations.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/networkpolicies.crd.projectcalico.org created
    customresourcedefinition.apiextensions.k8s.io/networksets.crd.projectcalico.org created
    clusterrole.rbac.authorization.k8s.io/calico-kube-controllers created
    clusterrole.rbac.authorization.k8s.io/calico-node created
    clusterrole.rbac.authorization.k8s.io/calico-cni-plugin created
    clusterrolebinding.rbac.authorization.k8s.io/calico-kube-controllers created
    clusterrolebinding.rbac.authorization.k8s.io/calico-node created
    clusterrolebinding.rbac.authorization.k8s.io/calico-cni-plugin created
    daemonset.apps/calico-node created
    deployment.apps/calico-kube-controllers created
    ```

    ```bash  
    chmod +x calicoctl && mv calicoctl /usr/bin
    calicoctl version
      % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                    Dload  Upload   Total   Spent    Left  Speed
      0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
    100 64.4M  100 64.4M    0     0  21.2M      0  0:00:03  0:00:03 --:--:-- 40.4M
    Client Version:    v3.28.1
    Git commit:        601856343
    Cluster Version:   v3.28.1
    Cluster Type:      k8s,bgp,kubeadm,kdd
    ```  

## 2. Retina 설치  

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
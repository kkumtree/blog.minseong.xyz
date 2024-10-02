---
date: 2024-10-02T12:54:17+09:00
title: "Kubernetes Service(2): LoadBalancer(MetalLB) - 곧 작성완료"
tags:
 - kans
 - kind
 - metallb
 - loadbalancer
 - kubernetes
authors:
  - name: kkumtree
    bio: plumber for infra
    email: mscho7969@ubuntu.com
    launchpad: mscho7969
    github: kkumtree
    profile: https://avatars.githubusercontent.com/u/52643858?v=4 
i
image: cover.png # 커버 이미지 URL
draft: false # 글 초안 여부
---

지난 포스팅, [Kubernetes Service(1): ClusterIP/NodePort](https://blog.minseong.xyz/post/kans-4w-clusterip-nodeport/)에 이어 LoadBalancer Type을 가볍게 살펴보고, MetalLB를 가볍게 붙여보겠습니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 1. LoadBalancer Type

Service(1)에서 언급된 부분은 거두절미하고, 추가로 적을 수 있는 부분이 있다면, 아래 한 줄이 있습니다. 

> You can define a LoadBalancer Service by disabling the load balancer NodePort allocation.

글자 그대로 LB의 `NodePort` 할당을 비활성하여, LoadBalancer Service를 정의할 수 있습니다.  
[Disabling load balancer NodePort allocation](https://kubernetes.io/docs/concepts/services-networking/service/#load-balancer-nodeport-allocation) 문서를 살펴보니,  
v1.24부터 Stable 상태로 보입니다. 

해당 문서에서 핵심만 추리자면...  

- `spec.allocateLoadBalancerNodePorts`: `true` (default)  
- Traffic을 Pod로 직접 Routing하는 LB를 구현(implementation)하고자 할 때만 `false`로 변경하여 사용되어야 한다고 합니다.  
- 그렇지 않으면, 즉 Node port가 할당된 **기존** 노드에 `false`가 설정되면, Node ports는 `자동으로 할당 해제`되지 않는다고 합니다.  
  - `**not** be de-allocated automatically`  
  - 모든 서비스에서 명시적으로 `nodePorts` 를 제거해야한다고 합니다.  
- 그리고 어조가 꽤나 센 편입니다.  

~~그만 알아보자~~

## 2. MetalLB  

스터디 후반부에 AWS EKS를 사용하고, 현재는 kind 환경에서 진행하는 것이므로 MetalLB를 사용하기로 했습니다.  

이미 작년에 개인 프로젝트로 kubeadm+virtualbox 조합으로 구축할 때 외부 접근을 위해 MetalLB를 써봤고,  
[V-raptor SQ nano](https://www.xslab.co.kr/default/products/sqnano.php)로 이것저것 만져볼때, [Canonical microk8s](https://microk8s.io/docs/addon-metallb)에서도 metalLB addon을 지원하는 것을 알게된 바,  

이미 현업 분들에게는 친숙한 툴이라 생각하고 설명은 생략하겠습니다(?).  
사실 당시에 사서 고생을 해서, 포스팅을 남겨놨을 것 같았는데 코드로만 존재하네요. 빠른 손절.  
~~그건 그렇고 microk8s에서 metalLB addon 티커가 `v1.17`로 남아있어 심히 불편함을 감출 수 없군요~~   

일단 BGP는 클러스터링을 두 개를 해야되서 좀 그렇고, Layer2 기반으로 사용해보겠습니다.  

## 3. kind 구성  

### a. 초기 구성 

현재 작성 중인 디바이스에 kind가 깔려있지 않아 기존 포스팅([리눅스에 KIND 설치하기 w/golang](https://blog.minseong.xyz/post/kans-2w-kind-installation-on-linux/))를 참고하여 설치했습니다.  
기존 포스팅([KIND 톺아보기](https://blog.minseong.xyz/post/kans-2w-kind-overview/))과 달라진 점이 있다면, `kindest/node:v1.31.0`으로 버전을 올려 사용했습니다.  

```bash
❯ go version
go version go1.22.2 linux/amd64
❯ go env GOPATH
/home/kkumtree/go
❯ go install sigs.k8s.io/kind@v0.24.0
go: downloading sigs.k8s.io/kind v0.24.0
go: downloading github.com/spf13/pflag v1.0.5
go: downloading github.com/alessio/shellescape v1.4.2
go: downloading github.com/spf13/cobra v1.8.0
go: downloading github.com/pkg/errors v0.9.1
go: downloading github.com/mattn/go-isatty v0.0.20
go: downloading golang.org/x/sys v0.6.0
go: downloading github.com/pelletier/go-toml v1.9.5
go: downloading github.com/BurntSushi/toml v1.4.0
go: downloading github.com/evanphx/json-patch/v5 v5.6.0
go: downloading gopkg.in/yaml.v3 v3.0.1
go: downloading sigs.k8s.io/yaml v1.4.0
go: downloading github.com/google/safetext v0.0.0-20220905092116-b49f7bc46da2
❯ vi .profile # 동적 지정하는 것으로 자세한건 이전 포스팅 참조  
❯ source .profile
❯ kind version
kind v0.24.0 go1.22.2 linux/amd64
```

### b. kind 클러스터 yaml 구성 및 구축  

> 당연한 이야기지만, 이미지 크기가 900MB를 넘어서기 때문에 처음 띄울 시 시간이 다소 소요됩니다.  

#### (Network)  

- Node~~화된 컨테이너~~ network cidr: 172.18.0.0/16  
- Pod network cidr: 10.10.0.0/16  
  - `10.10.1.0/24, 10.10.2.0/24, 10.10.3.0/24, 10.10.4.0/24`  
    쪼개지는 이유 들었던 거 같은데 또 잊었다...  
- Service network cidr: 10.200.1.0/24  

#### (Entry)  

- [featureGates](https://kind.sigs.k8s.io/docs/user/configuration/#feature-gates)[[k8s](https://kubernetes.io/docs/reference/command-line-tools-reference/feature-gates/)]
  - Alpha,Beta 상태의 기능 관리  
  - InPlacePodVerticalScaling: false/alpha/1.27/-~~, 제곧내~~  
  - MultiCIDRServiceAllocator: false/beta/1.31/-, IPAddress 객체를 사용하여 Service ClusterIP에 대한 IP 주소 할당 추적  
- [extraPortMappings](https://kind.sigs.k8s.io/docs/user/configuration/#extra-port-mappings): 호스트와 컨테이너 간 포트 매핑  
  - 30000~30004
- [Topology Aware Routing](https://kubernetes.io/docs/concepts/services-networking/topology-aware-routing/)  
  - `nodes.labels.topology.kubernetes.io/zone`: 이것은 대체 무엇인가?에 대한 해답
  - <= v1.27: `Topology Aware Hints` 로 불림.  
  - EndpointSlice controller: 할당 가능한 CPU 코어 수를 기반으로 엔드포인트 및 kube-proxy 할당  
  - 국문: [토폴로지 인지 힌트](https://kubernetes.io/ko/docs/concepts/services-networking/topology-aware-hints/), [토폴로지 키](https://kubernetes.io/ko/docs/concepts/services-networking/service-topology/)  
    - deprecated: 이후 없어질 수 있음  
- [kubeadmConfigPatches]  
  - 제곧내... 의 느낌이 솔솔 나지만  
  - `extraArgs.runtime-config: api/all=true` 의미는?  
  - ~~채찍피티~~코파일럿에게 물어봤더니, 대충 링크를 던져줬습니다.  
  - [Runtime Configuration](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/)  
  - 포맷: `--runtime-config <comma-separated 'key=value' pairs>`  
  - 실제: `-runtime-config=api/all=true`  
  - 해당 파라미터: api/all=true|false controls all API versions  
  - 다행히 링크는 잘 주셨군요.  
  - ~~이런 숭악한 걸 다들 어떻게 쓰시는 거지 @.@~~  

```bash
cat <<EOT> kind-metallb-test.yaml
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
  - containerPort: 30003
    hostPort: 30003
  - containerPort: 30004
    hostPort: 30004
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
```

이후 실행합니다.  

```bash
kind create cluster --config kind-metallb-test.yaml --name myk8s --image kindest/node:v1.31.0
# Install additional tools 
docker exec -it myk8s-control-plane sh -c 'apt update && apt install tree psmisc lsof wget bsdmainutils bridge-utils net-tools dnsutils ipset ipvsadm nfacct tcpdump ngrep iputils-ping arping git vim arp-scan -y'
```  

## 4. 테스트 Pod 구성

### a. 환경 기본정보 확인

```bash
# cidr check
❯ kubectl cluster-info dump | grep -m 2 -E "cluster-cidr|service-cluster-ip-range"
                            "--service-cluster-ip-range=10.200.1.0/24",
                            "--cluster-cidr=10.10.0.0/16",
# confirm kube-proxy mode: iptables proxy mode
❯ kubectl describe  configmap -n kube-system kube-proxy | grep mode
mode: iptables
# iptables info  
# 출력값은 너무 길어서 생략 / MetalLB 설치 후 대조용  
for i in filter nat mangle raw ; do echo ">> IPTables Type : $i <<"; docker exec -it myk8s-control-plane  iptables -t $i -S ; echo; done
for i in filter nat mangle raw ; do echo ">> IPTables Type : $i <<"; docker exec -it myk8s-worker  iptables -t $i -S ; echo; done
for i in filter nat mangle raw ; do echo ">> IPTables Type : $i <<"; docker exec -it myk8s-worker2 iptables -t $i -S ; echo; done
for i in filter nat mangle raw ; do echo ">> IPTables Type : $i <<"; docker exec -it myk8s-worker3 iptables -t $i -S ; echo; done
```

### b. 테스트 Pod 생성  

```bash
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: webpod1
  labels:
    app: webpod
spec:
  nodeName: myk8s-worker
  containers:
  - name: container
    image: traefik/whoami
  terminationGracePeriodSeconds: 0
---
apiVersion: v1
kind: Pod
metadata:
  name: webpod2
  labels:
    app: webpod
spec:
  nodeName: myk8s-worker2
  containers:
  - name: container
    image: traefik/whoami
  terminationGracePeriodSeconds: 0
EOF

# pod/webpod1 created
# pod/webpod2 created
```

## 5. MetalLB 설치  

BGP모드는 시도도 해봤었지만, 여러가지 이유로 L2 Layer 방식으로 설치합니다.  

> 참고: kube-proxy 의 ipvs 모드 사용 시 'strictARP: true' 설정 필요  

- 그냥 Documentation 보세요  
  <https://metallb.universe.tf/installation/>  
- 스터디 시간에는 Manifest로 진행했지만,  
  오늘도 청개구리는 [Operator](https://metallb.universe.tf/installation/#using-the-metallb-operator)로 설치할 겁니다 (?_?)  
- OperatorHub: [metallb-operator](https://operatorhub.io/operator/metallb-operator)  
- (참고용) FRR모드  
  - BGP세션을 BFD세션으로 백업  
  - BGP Only 대비 빠르게 오류를 검증한다고 합니다.  
  - BFD?: [Docs/Juniper Networks](https://www.juniper.net/documentation/kr/ko/software/junos/high-availability/topics/topic-map/bfd.html)  
  - Bidirectional Forwarding Detection  

### a. GitHub, GitHub를 보자...  

음, 오퍼레이터허브에 들어왔더니 뭐가 뭔지 모르겠습니다. GitHub로 재빠르게 도?망칩니다.  
- [metallb/metallb-operator](https://github.com/metallb/metallb-operator)  

다행히 README는 멀쩡하네요. 아니 생각보다 괜찮은데요?  

- kind는 원래 개발 환경용인지라, e2e테스트까지 제공하네요.  

```bash
git clone https://github.com/metallb/metallb-operator.git
cd metallb-operator
make deploy
cat << EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: MetalLB
metadata:
  name: metallb
  namespace: metallb-system
EOF
make test
make test-e2e
```
그저 Quick Start 닥돌해보겠습니다.  

> 마지막 커밋 메시지가 아래와 같은데...  
> 뭐 괜찮겠죠
> Openshift: instruct the cluster network operator to deploy frrk8s

### b. Quick Start

```bash
# 아래 커맨드 응용
# kubectl apply -f bin/metallb-operator.yaml 
# CRD 다운로드  
curl -LO https://raw.githubusercontent.com/metallb/metallb-operator/refs/heads/main/bin/metallb-operator.yaml 
# CRD 적용
kubectl apply -f metallb-operator.yaml
```
아래와 유사하게 출력됩니다.  

```bash
❯ curl -LO https://raw.githubusercontent.com/metallb/metallb-operator/refs/heads/main/bin/metallb-operator.yaml 
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  233k  100  233k    0     0   799k      0 --:--:-- --:--:-- --:--:--  797k
❯ kubectl apply -f metallb-operator.yaml
namespace/metallb-system created
customresourcedefinition.apiextensions.k8s.io/bfdprofiles.metallb.io created
customresourcedefinition.apiextensions.k8s.io/bgpadvertisements.metallb.io created
customresourcedefinition.apiextensions.k8s.io/bgppeers.metallb.io created
customresourcedefinition.apiextensions.k8s.io/communities.metallb.io created
customresourcedefinition.apiextensions.k8s.io/frrconfigurations.frrk8s.metallb.io created
customresourcedefinition.apiextensions.k8s.io/frrnodestates.frrk8s.metallb.io created
customresourcedefinition.apiextensions.k8s.io/ipaddresspools.metallb.io created
customresourcedefinition.apiextensions.k8s.io/l2advertisements.metallb.io created
customresourcedefinition.apiextensions.k8s.io/metallbs.metallb.io created
customresourcedefinition.apiextensions.k8s.io/servicel2statuses.metallb.io created
serviceaccount/manager-account created
role.rbac.authorization.k8s.io/metallb-manager-role created
clusterrole.rbac.authorization.k8s.io/metallb-manager-role created
rolebinding.rbac.authorization.k8s.io/metallb-manager-rolebinding created
clusterrolebinding.rbac.authorization.k8s.io/metallb-manager-rolebinding created
secret/metallb-operator-webhook-server-cert created
secret/metallb-webhook-cert created
service/metallb-operator-webhook-service created
service/metallb-webhook-service created
deployment.apps/metallb-operator-controller-manager created
deployment.apps/metallb-operator-webhook-server created
validatingwebhookconfiguration.admissionregistration.k8s.io/metallb-operator-webhook-configuration created
validatingwebhookconfiguration.admissionregistration.k8s.io/metallb-webhook-configuration created
serviceaccount/controller created
serviceaccount/frr-k8s-daemon created
serviceaccount/speaker created
role.rbac.authorization.k8s.io/controller created
role.rbac.authorization.k8s.io/frr-k8s-daemon-role created
role.rbac.authorization.k8s.io/frr-k8s-daemon-scc created
role.rbac.authorization.k8s.io/pod-lister created
role.rbac.authorization.k8s.io/speaker created
clusterrole.rbac.authorization.k8s.io/metallb-system:kube-rbac-proxy created
clusterrole.rbac.authorization.k8s.io/frr-k8s-daemon-role created
clusterrole.rbac.authorization.k8s.io/frr-k8s-metrics-reader created
clusterrole.rbac.authorization.k8s.io/frr-k8s-proxy-role created
clusterrole.rbac.authorization.k8s.io/metallb-system:controller created
clusterrole.rbac.authorization.k8s.io/metallb-system:speaker created
rolebinding.rbac.authorization.k8s.io/controller created
rolebinding.rbac.authorization.k8s.io/frr-k8s-daemon-rolebinding created
rolebinding.rbac.authorization.k8s.io/frr-k8s-daemon-scc-binding created
rolebinding.rbac.authorization.k8s.io/pod-lister created
rolebinding.rbac.authorization.k8s.io/speaker created
clusterrolebinding.rbac.authorization.k8s.io/kube-rbac-proxy created
clusterrolebinding.rbac.authorization.k8s.io/frr-k8s-daemon-rolebinding created
clusterrolebinding.rbac.authorization.k8s.io/frr-k8s-proxy-rolebinding created
clusterrolebinding.rbac.authorization.k8s.io/metallb-system:controller created
clusterrolebinding.rbac.authorization.k8s.io/metallb-system:speaker created
```

### c. 오퍼레이터 관련 리소스 확인

오퍼레이터가 제대로 적용되었는지 체크해봅시다.  

> CRD에 FRR관련 정의도 들어간거 같은데 일단 눈을 감고 해봅시다.  

```bash
❯ kubectl get crd | grep metallb
bfdprofiles.metallb.io                2024-10-02T14:18:46Z
bgpadvertisements.metallb.io          2024-10-02T14:18:46Z
bgppeers.metallb.io                   2024-10-02T14:18:46Z
communities.metallb.io                2024-10-02T14:18:46Z
frrconfigurations.frrk8s.metallb.io   2024-10-02T14:18:46Z
frrnodestates.frrk8s.metallb.io       2024-10-02T14:18:46Z
ipaddresspools.metallb.io             2024-10-02T14:18:46Z
l2advertisements.metallb.io           2024-10-02T14:18:46Z
metallbs.metallb.io                   2024-10-02T14:18:46Z
servicel2statuses.metallb.io          2024-10-02T14:18:46Z
```  

> 아래부터는 이해없이 무따기로 한거라, 양해 부탁드립니다.  

NS, POD(deployment,replicaset), SVC, CM, SECRET, EP 다 셋팅되었네요. 

```bash
❯ kubectl get all,configmap,secret,ep -n metallb-system
NAME                                                       READY   STATUS    RESTARTS   AGE
pod/metallb-operator-controller-manager-5dbc8fd577-bgczj   1/1     Running   0          13m
pod/metallb-operator-webhook-server-77d47cb764-9lcs8       1/1     Running   0          13m

NAME                                       TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/metallb-operator-webhook-service   ClusterIP   10.200.1.159   <none>        443/TCP   13m
service/metallb-webhook-service            ClusterIP   10.200.1.149   <none>        443/TCP   13m

NAME                                                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/metallb-operator-controller-manager   1/1     1            1           13m
deployment.apps/metallb-operator-webhook-server       1/1     1            1           13m

NAME                                                             DESIRED   CURRENT   READY   AGE
replicaset.apps/metallb-operator-controller-manager-5dbc8fd577   1         1         1       13m
replicaset.apps/metallb-operator-webhook-server-77d47cb764       1         1         1       13m

NAME                         DATA   AGE
configmap/kube-root-ca.crt   1      13m

NAME                                          TYPE     DATA   AGE
secret/metallb-operator-webhook-server-cert   Opaque   4      13m
secret/metallb-webhook-cert                   Opaque   4      13m

NAME                                         ENDPOINTS        AGE
endpoints/metallb-operator-webhook-service   10.10.2.2:9443   13m
endpoints/metallb-webhook-service            10.10.3.3:9443   13m
```

파드 내에 kube-rbac-proxy 컨테이너는 프로메테우스 익스포터 역할 제공한다고 합니다.  

```bash
❯ kubectl get pods -n metallb-system -l app=metallb -o jsonpath="{range .items[*]}{.metadata.name}{':\n'}{range .spec.containers[*]}{'  '}{.name}{' -> '}{.image}{'\n'}{end}{end}"
metallb-operator-webhook-server-77d47cb764-9lcs8:
  webhook-server -> quay.io/metallb/controller:main
```

metallb 컨트롤러는 디플로이먼트로 배포된다고 합니다.  

```bash
❯ kubectl get ds,deploy -n metallb-system
NAME                                                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/metallb-operator-controller-manager   1/1     1            1           20m
deployment.apps/metallb-operator-webhook-server       1/1     1            1           20m
```

여기서 살짝 싸하네요. 그냥 다 밀어버리고 처음부터 다시 할까;  
speaker pods(`speaker-lorem`)가 보이지 않는데, 이거 BGP 같기도...  
> control-plane 이랑 worker2는 어디로?  

```bash
❯ kubectl get pod -n metallb-system -o wide
NAME                                                   READY   STATUS    RESTARTS   AGE   IP          NODE            NOMINATED NODE   READINESS GATES
metallb-operator-controller-manager-5dbc8fd577-bgczj   1/1     Running   0          21m   10.10.2.2   myk8s-worker3   <none>           <none>
metallb-operator-webhook-server-77d47cb764-9lcs8       1/1     Running   0          21m   10.10.3.3   myk8s-worker    <none>           <none>
```

가다듬고 더 잘 찾아보니, [OpenShift Docs](https://docs.redhat.com/ko/documentation/openshift_container_platform/4.11/html/networking/metallb-operator-install#nw-metallb-operator-initial-config_metallb-operator-install)에서 정상이라고 하네요.  

자신감을 갖고 이어봅시다. 

### d. MetalLB deployment 생성  

> GitHub 만으로는 도저히 이게 뭘하는 건가 했는데, 스피커를 만들어주는 것 같네요.  

```bash
❯ cat << EOF | kubectl apply -f -
apiVersion: metallb.io/v1beta1
kind: MetalLB
metadata:
  name: metallb
  namespace: metallb-system
EOF
metallb.metallb.io/metallb created
```

제발...! (네트워크 상태가 좋지 않아서 핫스팟...)

```bash
❯ kubectl get pod -n metallb-system -o wide
NAME                                                   READY   STATUS             RESTARTS   AGE    IP           NODE                  NOMINATED NODE   READINESS GATES
controller-7dd49fb757-rsf9n                            0/1     ImagePullBackOff   0          118s   10.10.2.3    myk8s-worker3         <none>           <none>
metallb-operator-controller-manager-5dbc8fd577-bgczj   1/1     Running            0          36m    10.10.2.2    myk8s-worker3         <none>           <none>
metallb-operator-webhook-server-77d47cb764-9lcs8       1/1     Running            0          36m    10.10.3.3    myk8s-worker          <none>           <none>
speaker-ndwfb                                          0/4     Init:0/3           0          118s   172.18.0.3   myk8s-worker3         <none>           <none>
speaker-vnjlb                                          0/4     Init:0/3           0          118s   172.18.0.5   myk8s-worker          <none>           <none>
speaker-w9946                                          0/4     Init:0/3           0          118s   172.18.0.2   myk8s-worker2         <none>           <none>
speaker-zgf46                                          0/4     Init:0/3           0          118s   172.18.0.4   myk8s-control-plane   <none>           <none>
```

휴

```bash
Events:
  Type     Reason     Age                  From               Message
  ----     ------     ----                 ----               -------
  Normal   Scheduled  2m30s                default-scheduler  Successfully assigned metallb-system/controller-7dd49fb757-rsf9n to myk8s-worker3
  Warning  Failed     57s                  kubelet            Failed to pull image "quay.io/metallb/controller:main": failed to pull and unpack image "quay.io/metallb/controller:main": failed to copy: read tcp 172.18.0.3:33674->104.18.37.147:443: read: connection reset by peer
  Warning  Failed     57s                  kubelet            Error: ErrImagePull
  Normal   BackOff    56s                  kubelet            Back-off pulling image "quay.io/metallb/controller:main"
  Warning  Failed     56s                  kubelet            Error: ImagePullBackOff
  Normal   Pulling    45s (x2 over 2m29s)  kubelet            Pulling image "quay.io/metallb/controller:main"
  Normal   Pulled     31s                  kubelet            Successfully pulled image "quay.io/metallb/controller:main" in 13.488s (13.488s including waiting). Image size: 29150053 bytes.
  Normal   Created    31s                  kubelet            Created container controller
  Normal   Started    31s                  kubelet            Started container controller
``` 

잘 돌아갑니다.  

```bash
❯ kubectl get pod -n metallb-system -o wide
NAME                                                   READY   STATUS    RESTARTS   AGE    IP           NODE                  NOMINATED NODE   READINESS GATES
controller-7dd49fb757-rsf9n                            1/1     Running   0          4m3s   10.10.2.3    myk8s-worker3         <none>           <none>
metallb-operator-controller-manager-5dbc8fd577-bgczj   1/1     Running   0          38m    10.10.2.2    myk8s-worker3         <none>           <none>
metallb-operator-webhook-server-77d47cb764-9lcs8       1/1     Running   0          38m    10.10.3.3    myk8s-worker          <none>           <none>
speaker-ndwfb                                          4/4     Running   0          4m3s   172.18.0.3   myk8s-worker3         <none>           <none>
speaker-vnjlb                                          3/4     Running   0          4m3s   172.18.0.5   myk8s-worker          <none>           <none>
speaker-w9946                                          3/4     Running   0          4m3s   172.18.0.2   myk8s-worker2         <none>           <none>
speaker-zgf46                                          4/4     Running   0          4m3s   172.18.0.4   myk8s-control-plane   <none>           <none>
```

~~아직 끝난게 아니다!~~ 셋업이 덜 되서 바로 에러뜹니다.  

```bash
❯ kubectl logs -n metallb-system -l app=metallb -f
Defaulted container "speaker" out of: speaker, frr, reloader, frr-metrics, cp-frr-files (init), cp-reloader (init), cp-metrics (init)
Defaulted container "speaker" out of: speaker, frr, reloader, frr-metrics, cp-frr-files (init), cp-reloader (init), cp-metrics (init)
Defaulted container "speaker" out of: speaker, frr, reloader, frr-metrics, cp-frr-files (init), cp-reloader (init), cp-metrics (init)
Defaulted container "speaker" out of: speaker, frr, reloader, frr-metrics, cp-frr-files (init), cp-reloader (init), cp-metrics (init)
error: you are attempting to follow 6 log streams, but maximum allowed concurrency is 5, use --max-log-requests to increase the limit
```

### e. MetalLB ConfigMap 생성

그렇습니다. 이제 kind에서 사용하는 브리지(docker bridge)를 확인하고 이 대역을 잡아줘야합니다.  

근데 방전되서 있다 더 작성해볼께요.  

## 9. 뱀다리  

### a. docker brigde network default cidr?  

... 가만 생각해보니, 172.18.0.0 대역을 yaml에 지정도 안했는데 그눔의 Docker 문서에선 눈에 잘 안 띄네?를 2주 전부터 생각했었는데 

[serverfault/916941](https://serverfault.com/questions/916941/configuring-docker-to-not-use-the-172-17-0-0-range)을 보고 기억났습니다.  

도커 네트워크 브릿지 설정 값을 보면 되는 것 ... 분명 이거 덕분에 삽질을 좀 했던거로 아는데 안 적어두니 또륵.  
도커가 이렇게나 위?험합니다.  

```bash
❯ docker -v
Docker version 24.0.7, build 24.0.7-0ubuntu4.1
❯ sudo docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
a90c02431872   bridge    bridge    local
d2f5be011872   host      host      local
439c3626705a   none      null      local
❯ sudo docker network inspect bridge
[
    {
        "Name": "bridge",
        "Id": "a90c02431872f243e6c3918d0ca4f8875fb070ae0ad1a504891b74485634de14",
        "Created": "2024-10-02T08:22:04.247414071+09:00",
        "Scope": "local",
        "Driver": "bridge",
        "EnableIPv6": false,
        "IPAM": {
            "Driver": "default",
            "Options": null,
            "Config": [
                {
                    "Subnet": "172.17.0.0/16",
                    "Gateway": "172.17.0.1"
                }
            ]
        },
        "Internal": false,
        "Attachable": false,
        "Ingress": false,
        "ConfigFrom": {
            "Network": ""
        },
        "ConfigOnly": false,
        "Containers": {},
        "Options": {
            "com.docker.network.bridge.default_bridge": "true",
            "com.docker.network.bridge.enable_icc": "true",
            "com.docker.network.bridge.enable_ip_masquerade": "true",
            "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0",
            "com.docker.network.bridge.name": "docker0",
            "com.docker.network.driver.mtu": "1500"
        },
        "Labels": {}
    }
]
```

### b. docker 권한 안 풀어두면, kind 에러 터지는 그거  

예, 그 뻔한 그거에요. 이 기기에서는 세팅을 안해뒀네요.  

```bash
ERROR: failed to create cluster: failed to list nodes: command "docker ps -a --filter label=io.x-k8s.kind.cluster=myk8s --format '{{.Names}}'" failed with error: exit status 1
Command Output: permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.24/containers/json?all=1&filters=%7B%22label%22%3A%7B%22io.x-k8s.kind.cluster%3Dmyk8s%22%3Atrue%7D%7D": dial unix /var/run/docker.sock: connect: permission denied
```

이렇게 하면 됩니다. 참 쉽죠?  

```bash
# https://snapcraft.io/docker refer and apply  
sudo addgroup --system docker
sudo adduser $USER docker
newgrp docker
sudo service docker restart
```  

```bash
❯ sudo addgroup --system docker
info: The group `docker' already exists as a system group. Exiting.
❯ sudo adduser $USER docker
info: Adding user `kkumtree' to group `docker' ...
❯ newgrp docker
❯ sudo service docker restart
```  
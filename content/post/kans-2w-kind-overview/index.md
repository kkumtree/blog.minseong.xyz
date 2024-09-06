---
date: 2024-09-03T21:16:07+09:00
title: "KIND 톺아보기"
tags:
 - kans  
 - kind    
 - kubernetes  
authors:
	- name: kkumtree
		bio: plumber for infra
		email: mscho7969@ubuntu.com
		launchpad: mscho7969
		github: kkumtree
		profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: kind_banner.png
draft: true
---

> [톺아보다(우리말샘)](https://opendict.korean.go.kr/dictionary/view?sense_no=437729&viewType=confirm) 는 의외로 표준어라고 합니다.  

[KIND 설치](../kans-2w-kind-installation-on-linux/) 이후에 기본적인 내용을 살펴봅니다.  

## 0. $KUBECONFIG

- $KUBECONFIG 환경변수가 없을 경우:  
  보통은 `~/.kube` 디렉토리가 생성됩니다.  
  확인해보니, config 값과 더불어, `cache` 디렉토리도 확인할 수 있었습니다.  

  ```bash
  ❯ find ~/.kube -maxdepth 2 -type f -exec ls -ld "{}" \;
  -rw------- 1 kkumtree kkumtree 44 Sep  3 21:31 /home/kkumtree/.kube/config
  ❯ find ~/.kube -maxdepth 2 -type d -exec ls -ld "{}" \;
  drwxr-x--- 3 kkumtree kkumtree 4096 Sep  3 21:31 /home/kkumtree/.kube
  drwxr-x--- 4 kkumtree kkumtree 4096 Sep  3 21:11 /home/kkumtree/.kube/cache
  drwxr-x--- 5 kkumtree kkumtree 4096 Sep  3 21:28 /home/kkumtree/.kube/cache/discovery
  drwxr-x--- 3 kkumtree kkumtree 4096 Sep  3 21:28 /home/kkumtree/.kube/cache/http
  ```

- KIND용 $KUBECONFIG 설정:  
  그래서 아래처럼, 경로를 만들고 $KUBECONFIG 환경변수를 설정해주었습니다.

  ```bash
  mkdir -p ~/.kind
  export KUBECONFIG=~/.kind/kubeconfig
  ```

- (참고) 과거에 변수로 좀 곯머리를 앓았다보니, 쉘스크립팅 예제를 짜봤습니다.  
  <https://github.com/kkumtree/kans/blob/week2/kind-basic/kubeconfig_manager.sh>

  ```bash
  ❯ pwd
  /home/kkumtree/Documents/github/kans/kind-basic
  ❯ ll
  total 4.0K
  -rwxrwxr-x 1 kkumtree kkumtree 1.1K Sep  2 22:49 kubeconfig_manager.sh
  ❯ . ./kubeconfig_manager.sh
  ==============================
  | kubeconfig manager for kind
  ------------------------------
  | $HOME: $$/home/kkumtree$$
  | $KUBECONFIG: $$$$
  ==============================
  (Press Enter to confirm OR type custom path)
  kubeconfig for kind [/home/kkumtree/.kind/kubeconfig]:
  env KUBECONFIG is set to: $$/home/kkumtree/.kind/kubeconfig$$
  ❯ . ./kubeconfig_manager.sh
  env KUBECONFIG is unset
  ```

## 1. KIND 첫 구동

- KIND는 이름 값대로 컨테이너 이미지를 사용합니다.  
  그래서, 이미지가 로컬에 없다면 받는데 시간이 소요됩니다.  

  ```bash
  ❯ docker images
  REPOSITORY     TAG       IMAGE ID       CREATED       SIZE
  kindest/node   v1.30.4   ea9c94202240   2 weeks ago   991MB
  ```    

- 새로운 터미널을 한 쪽에 열어, 어떻게 작동하는지 살펴보기 위한 준비를 합니다.
  
  ```bash
  watch kubectl get pod -A --sort-by=.metadata.creationTimestamp
  ```

- 사용 이미지 지정: `kindest/node:v1.30.4`  
  최신버전인 `v1.31`은 앞으로 적용해볼 서비스들과 호환성을 위해, 버전을 낮춰서 사용합니다.  

  ```bash
  ❯ kind create cluster --image kindest/node:v1.30.4
  Creating cluster "kind" ...
  ✓ Ensuring node image (kindest/node:v1.30.4) 🖼
  ✓ Preparing nodes 📦
  ✓ Writing configuration 📜
  ✓ Starting control-plane 🕹️
  ✓ Installing CNI 🔌
  ✓ Installing StorageClass 💾
  Set kubectl context to "kind-kind"
  You can now use your cluster with:

  kubectl cluster-info --context kind-kind

  Thanks for using kind! 😊
  ```  

- 아래와 같이, control-plane pod 내부에 pod가 순차적으로 올라오는 것을 볼 수 있습니다.  
	(phase.1) etcd/apiserver/controller-manager/scheduler 가 먼저 올라옵니다.
	(phase.2) coredns/kube-proxy 그리고 kindnet, local path provisioner 가 설치됩니다. 

	```bash
	❯ (앞에서 다른 터미널로 2초마다 감시)watch kubectl get pod -A --sort-by=.metadata.creationTimestamp
	NAMESPACE            NAME                                         READY   STATUS    RESTARTS   AGE
	kube-system          etcd-kind-control-plane                      1/1     Running   0          7m5s
	kube-system          kube-apiserver-kind-control-plane            1/1     Running   0          7m5s
	kube-system          kube-controller-manager-kind-control-plane   1/1     Running   0          7m5s
	kube-system          kube-scheduler-kind-control-plane            1/1     Running   0          7m5s
	kube-system          coredns-7db6d8ff4d-dtgmb                     1/1     Running   0          6m51s
	kube-system          coredns-7db6d8ff4d-zfsp2                     1/1     Running   0          6m51s
	kube-system          kindnet-4l5v8                                1/1     Running   0          6m51s
	kube-system          kube-proxy-gt6fw                             1/1     Running   0          6m51s
	local-path-storage   local-path-provisioner-7d4d9bdcc5-pw5b2      1/1     Running   0          6m51s
	```

- 구동 상태에서 kubeconfig 파일은 다음과 같은 구조로 내용을 담고 있음을 알 수 있습니다.

	```bash
	❯ cat ~/.kind/kubeconfig
	apiVersion: v1
	clusters:
	- cluster:
			certificate-authority-data: <base64encoded>
			server: https://127.0.0.1:40305
		name: kind-kind
	contexts:
	- context:
			cluster: kind-kind
			user: kind-kind
		name: kind-kind
	current-context: kind-kind
	kind: Config
	preferences: {}
	users:
	- name: kind-kind
		user:
			client-certificate-data: <base64encoded> 
			client-key-data: <base64encoded>
	```

- 클러스터를 삭제한 후, kubeconfig 파일을 확인해보면, 상세 값들이 지워졌음을 확인할 수 있습니다.  

	```bash
	❯ kind delete cluster
	Deleting cluster "kind" ...
	Deleted nodes: ["kind-control-plane"]
	❯ cat ~/.kind/kubeconfig
	apiVersion: v1
	kind: Config
	preferences: {}
	```


## 2. kindnet? local-path-provisioner? 는 무엇인가?

- 문득, `이 두 가지는 뭘까?` 하고  ~~위험한~~ 궁금증이 생겨 찾아봤습니다. 

### kindnet

[GitHub/kindnet](https://github.com/aojea/kindnet#kindnet-components)의 내용을 요약하면,  

- 현재, KIND의 기본 CNI 플러그인
- `모든` 클러스터 노드가 동일한 서브넷에 속한 환경에서만 작동
- 임베디드 ipmasq(IP매스커레이드) 에이전트
- IPv6를 지원하는 CNI플러그인이 부족한 상황에서 개발됨

또한 [TKNG](https://www.tkng.io/cni/kindnet/)에서는 Reachability(도달성)과 Connectivity(연결성)관점에서 CNI 플러그인으로서의 요건 충족을 설명하고 있었습니다.  

### local-path-provisioner

[GitHub/local-path-provisioner](https://github.com/rancher/local-path-provisioner): SUSE의 RANCHER에서 관리하고 있다는 것을 처음 인지하였습니다.

또한 `그냥 로컬PV랑 똑같은거 아니야?`라고 하기엔 사소한(?) 오해가 있었습니다.  

- k8s에서 기본으로 지원하는, `Local Persistent Volume` 보다 간단한 솔루션  
- 사용자 구성에 따라 `hostPath` 또는 `local` 기반의 PV를 노드에 자동으로 생성  
- (단점)볼륨 용량 제한을 둘 수 없음. 값이 설정되어있더라도 무시  



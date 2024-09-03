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

- (참고) 변수로 좀 곯머리를 앓아서, 쉘스크립팅 예제를 짜봤습니다.  
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

- 새로운 터미널을 한 쪽에 열어, 관측 준비를 합니다.
  
  ```bash
  watch kubectl get pod -A --sort-by=.metadata.creationTimestamp
  ```

- 사용 이미지 지정: `kindest/node:v1.30.4`  
  v1.31은 앞으로 적용해볼 서비스들과 호환성을 탄다고 하여, 낮춰서 사용합니다.  

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

- 쉘  

```bash
❯ kubectl get pod -A --sort-by=.metadata.creationTimestamp
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

```bash
❯ kind delete cluster
Deleting cluster "kind" ...
Deleted nodes: ["kind-control-plane"]
❯ cat ~/.kind/kubeconfig
apiVersion: v1
kind: Config
preferences: {}
```  

---
date: 2024-09-02T00:33:19+09:00
title: "리눅스에 KIND 설치하기 w/golang"
tags:
 - kans  
 - installation  
 - kind  
 - golang  
 - kubernetes  
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: kind_banner.png
draft: false
---

> Helm 설치 추가

[CloudNet@](https://gasidaseo.notion.site/24-3-df0466c474ff40528e37b24bfdfe9d0f)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)에 참여하게 되면서 기록을 남기고 있습니다.  

이번에는 kind(**K**ubernetes **IN** **D**ocker)를 Golang을 통해 설치하면서 약간의 소?란이 있었던 부분만 다룹니다.  

## 1. KIND란?  

- 아래 사진으로 대체합니다. 자세한 내용은 [Docs/Initial_design](https://kind.sigs.k8s.io/docs/design/initial/)에서 볼수 있습니다.  

![Concept](https://kind.sigs.k8s.io/docs/images/diagram.png)

## 2. KIND 설치하기

- [Docs/Quick-start](https://kind.sigs.k8s.io/docs/user/quick-start/)를 참고합니다.  

Linux의 경우, 패키지 관리자 설치가 없어 바이너리, 혹은 소스로 설치해야 합니다.  

아래 두 문장에 뭔가 발동하여 Go 언어로 설치를 해보기로 했습니다.  

```text
If you are a go developer you may find the go install option convenient.

Otherwise we supply downloadable release binaries, community-managed packages, and a source installation guide.
```  

## 3. 설치는 매우 간단

- Go 개발자는 아니지만, 잘 깔려있었고 그 GOPATH 환경변수도 확인됩니다. 무슨일이람.  

```bash
❯ go version
go version go1.22.2 linux/amd64
❯ go env GOPATH
/home/kkumtree/go
```

- [Docs](https://kind.sigs.k8s.io/docs/user/quick-start/#installing-with-go-install)를 잘 읽고, 아래와 같이 설치하면 됩니다.  

```bash
go install sigs.k8s.io/kind@v0.24.0
```

## 4. 이걸로 `끝` 일리가 없다. 환경변수 설정

- 그런 건 존재하지 않습니다. Go를 개발에 사용해본 적이 없으면 아래처럼 Go 바이너리가 PATH 환경변수에 설정합니다.  

```bash
❯ env | grep go
PATH=/home/kkumtree/go/bin:/home/kkumtree/.tfenv/bin:/home/kkumtree/.tfenv/bin:/home/kkumtree/.tfenv/bin:/home/kkumtree/.sdkman/candidates/java/current/bin:/home/kkumtree/.nvm/versions/node/v18.15.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games:/snap/bin:/snap/bin
```

### (a안) `~/.bashrc`에 정적 지정

- 보통 이렇게하면, 사용하는데 별 문제가 없습니다.  

```bash
echo 'export PATH=$PATH:/home/kkumtree/go/bin' >> ~/.bashrc
# zsh일 경우) exec bash
source ~/.bashrc
# zsh일 경우, 다시 zsh로 복귀) exec zsh
```

### (b안) `~/.profile`에 동적 지정

- 별다른 이유는 없고, profile에 조건 설정이 되어있어서 추가해보았습니다.  
- 마지막 3줄만 추가로 작성

```bash
# ❯ cat ~/.profile
# ~/.profile: executed by the command interpreter for login shells.
# This file is not read by bash(1), if ~/.bash_profile or ~/.bash_login
# exists.
# see /usr/share/doc/bash/examples/startup-files for examples.
# the files are located in the bash-doc package.

# the default umask is set in /etc/profile; for setting the umask
# for ssh logins, install and configure the libpam-umask package.
#umask 022

# if running bash
if [ -n "$BASH_VERSION" ]; then
    # include .bashrc if it exists
    if [ -f "$HOME/.bashrc" ]; then
	. "$HOME/.bashrc"
    fi
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi

# set PATH so it includes user's private bin if it exists
if [ -d "$HOME/.local/bin" ] ; then
    PATH="$HOME/.local/bin:$PATH"
fi

# set PATH so it includes user's gopath if it exists
if [ -x "/usr/bin/go" ] && [ -d "$(/usr/bin/go env GOPATH)/bin" ] ; then
    PATH="$(/usr/bin/go env GOPATH)/bin:$PATH"
fi
```

`source ~/.profile`로 적용한 후, `kind version`으로 설치 확인.  

```bash
❯ source ~/.profile
❯ kind version
kind v0.24.0 go1.22.2 linux/amd64
```

## 5. 그 이외의 툴 설치

- kubectl: [kubernetes Docs](https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/#install-using-native-package-management).  
  아래 방법말고도, `sudo snap kubectl --classic` 한 줄만으로도 설치 가능합니다.  

```bash
## Debian-based distributions  

sudo apt-get update
# apt-transport-https may be a dummy package; if so, you can skip that package
sudo apt-get install -y apt-transport-https ca-certificates curl gnupg

# If the folder `/etc/apt/keyrings` does not exist, it should be created before the curl command, read the note below.
# sudo mkdir -p -m 755 /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
sudo chmod 644 /etc/apt/keyrings/kubernetes-apt-keyring.gpg # allow unprivileged APT programs to read this keyring

# This overwrites any existing configuration in /etc/apt/sources.list.d/kubernetes.list
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo chmod 644 /etc/apt/sources.list.d/kubernetes.list   # helps tools such as command-not-found to work correctly

sudo apt-get update
sudo apt-get install -y kubectl
```

- k9s: [Snapcraft/k9s](https://snapcraft.io/k9s).  
  전에 다른 분이 알록달록 잘 쓰셔서 한 번 설치해보았습니다.  
  
```bash
sudo snap install k9s
```  

- helm: [Helm Docs #From Apt (Debian/Ubuntu)](https://helm.sh/docs/intro/install/#from-apt-debianubuntu).  
  k8s를 편하게 쓰고자하는 일종의 레포지토리입니다.  

```bash
curl https://baltocdn.com/helm/signing.asc | gpg --dearmor | sudo tee /usr/share/keyrings/helm.gpg > /dev/null
# sudo apt-get install apt-transport-https --yes # Use If error occurs
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/helm.gpg] https://baltocdn.com/helm/stable/debian/ all main" | sudo tee /etc/apt/sources.list.d/helm-stable-debian.list
sudo apt-get update
sudo apt-get install helm
```  

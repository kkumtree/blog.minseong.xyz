---
date: 2023-04-30T03:00:15+09:00
title: "VSCode DevContainer - CI/CD 스터디 1주차"
tags:
  - vscode  
  - devcontainer  
  - docker
  - CloudNet@
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

한가위 연휴의 끝과 함께, [CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 CI/CD Study에 참여하게 되었습니다. 

이번에는 핸즈온용으로 즐겨쓰는 GitHub CodeSpace와 연관된, 
Visual Studio 상에서의 Dev Containers 활용에 대해 다뤄보고자 합니다. 

> 사용 OS환경은 Ubuntu Desktop 24.04 LTS 이며, 
  아래의 문서에서 안내된대로 차근차근 따라해보며 좀 더 이해를 해보고자 합니다. 

## 0. Docker 설치

내용이 길어, 아래의 포스트로 나누었습니다.  

- [Ubuntu Docker 설치](https://blog.minseong.xyz/post/docker-installation-in-ubuntu/)  
- 작성 기준, Dev Container는 Ubuntu Snap 패키지(snapcraft)로 설치된 Docker에는 지원되지 않는다고 합니다. 
- 사용자(`$USER`)를 `docker` 그룹에 추가하여야합니다.  
  (위 게시물의 `3. 권한 상승 설정 (선택)` 참고)

## 1. Dev Containers 확장 프로그램 

Visual Studio Code(이하, VSCode)에서 제공되는, `Dev Containers` 확장 프로그램을 사용하면, 개발 환경에 필요한 모든 기능이 갖춰진 Container를 구축하여 환경을 구성할 수 있습니다. 

컨테이너 내부 혹은 컨테이너에 마운트된 폴더를 통해 접근하여, VSCode IDE의 모든 기능을 사용할 수 있습니다. 

핵심은 `devcontainer.json` 파일이며, 프로젝트 단위에서 개발용 컨테이너의 구성 및 접근 방법이 명세되어 있습니다. 
이를 통해, 앱을 구동하거나 코드 개발에 필요한 도구, 라이브러리, 혹은 런타임을 사전에 정의할 수 있습니다.  

1. 컨테이너 내에서 구동될 파일들: 로컬 환경의 파일이 마운트되거나, 컨테이너 내부로 복사됩니다. 
2. VSCode의 확장 프로그램들: 컨테이너 내부에 설치되며, 내부의 플랫폼 및 파일시스템에 대한 **모든 권한**을 가집니다.  


![alt text](image-2.png)

이를 통해, 

- 개발환경을 쉽게 전환할 수 있습니다. 
- 다양한 로컬 환경과 관계없이, 개발 환경을 일관성있게 유지할 수 있습니다. 


`Dev Containers` 확장 프로그램은 두 가지 기본 모델을 지원합니다. 

1. 컨테이너를 풀타임 개발환경으로 사용하거나,  
2. 실행 중인 컨테이너에 연결하여 사용할 수 있습니다. 

## 2. 시작 전 설정

- 로컬 환경: 
  1. Docker 및 VSCode가 설치되어야 합니다.  
    (VSCode와 같은 경우, 기존 [게시물](https://blog.minseong.xyz/post/how-to-manage-microsoft-packages-with-apt-manager/)이 도움 될 수 있습니다.)
  2. Dev Container 확장프로그램을 설치합니다. 
- Git을 사용한다면: 이를 위한 로컬의 SSH Key를 공유하도록 설정할 수 있습니다.  

### Dev Container 확장프로그램 설치

VSCode 내 Extenstion 메뉴를 열고 Dev Contatiners를 검색, 설치 합니다.  
(Microsoft를 확인합니다)

![alt text](image.png)

![alt text](<Screenshot from 2025-10-17 21-51-01.png>)  

<https://code.visualstudio.com/remote/advancedcontainers/sharing-git-credentials>
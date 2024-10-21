---
date: 2024-10-21T19:47:33+09:00
title: "Wky eBPF?"
tags:
 - kans
 - ebpf
 - xdp
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

어느덧 이번 스터디도 대망의 Cilium을 다루기 시작합니다.  
Cilium에 이다지도 (저를 포함한) 모두가 열광하는지 알아보기 전에  
근간이 되는 eBPF를 먼저 가볍게 알아보고 가려합니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 1. Linux Network Stack  

스터디 1주차의 [Jenkins 컨테이너에서 Host의 Docker 데몬 사용하기](https://blog.minseong.xyz/post/kans-1w-container-socket/)에서 가볍게 맛을 보고 도망치기 바빴지만, 여튼 아래의 사항은 스쳐지나갔습니다.  

- iptables: userspace 기반의 네트워킹

ufw, firewalld 등의 방화벽 프로그램이 이를 래핑하였다는 건 대충 넘어간다하더라도,  
Linux 환경에서 userspace를 통해 제어를 한다는 것을 알아두었을 때,  
이를 네트워킹 스텍으로 사용하고 있는 기존의 방식이 약간이라도 번거롭다는 것을 느낄 수 있습니다.  

그 의미는 yaml에 적용하면, 일일히 iptables를 수정하여 사용한다는 의미이기 때문입니다.  

이를 또 풀게되면...  

- 한번 규칙(rule)을 수정한다고 할때, 재생성=모든 규칙을 업데이트한다.  
- Chaning 된 규칙은 연결리스트이기 때문에 모든 동작의 복잡도는 O(n).  
- ACLs는 우선순위가 높은 규칙에서 순차적으로 적용됩니다.  
- IP 및 포트를 기반으로 하며, L7 프로토콜에 대해서는 지원이 되지 않습니다.  
- 새로운 IP 혹은 포트가 추가되면, 규칙은 추가되어야하고 체이닝은 바뀌어야합니다.  
  즉 그때마다 모든 규칙을 업데이트해야하는 것입니다.  

결국 `kube-proxy`처럼 이를 활용한 Kubernetes에 있어 리소스 오버헤드가 발생한다고, [Youtube/FOSDEM2020](https://www.youtube.com/watch?v=lrP7hk-EW4U)에 나와있습니다.  

- 일반적으로 iptables를 쓰는 것이 kernel 단의 netfilter를 조작하는 익숙한 방식이라 적용하기 효율적이었을 것이라 생각됩니다.  

![linux-network-stack](images/linux-network-stack.png)

## 2. BPF(Berkeley Packet Filter) kernel hooks

BPF를 커널에 삽입하여, 패킷을 필터링(통제)할 수 있다고 하는데... 이걸로는 크게 와닿지 않고요.  
[다른 글](https://blog.naver.com/kangdorr/222593265958)에도 tcpdump를 대표적인 사용례로 소개하고 있습니다.  

[도서출판 인사이트](https://blog.insightbook.co.kr/2021/07/19/bpf-%EC%84%B1%EB%8A%A5-%EB%B6%84%EC%84%9D-%EB%8F%84%EA%B5%AC-bpf-%ED%8A%B8%EB%A0%88%EC%9D%B4%EC%8B%B1%EC%9D%84-%ED%86%B5%ED%95%9C-%EB%A6%AC%EB%88%85%EC%8A%A4-%EC%8B%9C%EC%8A%A4%ED%85%9C-%EA%B4%80/)에 따르면, 패킷 필터링을 넘어 `고급 성능 분석 도구 등에 이용되는 다양한 분야에 사용가능한 범용 실행 엔진을 일컽는 독립적 기술`이라고 하는데, 커널의 내부를 들여다 볼 수 있는 초능력(매직!)을 준다고 합니다.  

컴퓨터과학에 초능력이라니, 처음엔 갸웃했는데 Cilium을 보면서 그저 믿는 수밖에 없었죠.  

![what-bpf-do](images/what-bpf-do.png)  

## 3. eBPF(Extended BPF)  

그림판 실력보고 급 우울해져서 집에 가려고요.  
훌쩍  

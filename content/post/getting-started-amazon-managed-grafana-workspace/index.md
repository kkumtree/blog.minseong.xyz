---
date: 2024-11-02T21:43:00+09:00
title: "SAML for using Amazon Managed Grafana Workspace (To-Do)"
tags:
 - aws
 - grafana
authors:  
  - name: kkumtree  
    bio: plumber for infra  
    email: mscho7969@ubuntu.com  
    launchpad: mscho7969  
    github: kkumtree  
    profile: https://avatars.githubusercontent.com/u/52643858?v=4  
image: cover.png  
draft: false # 글 초안 여부
---

> Organization의 이슈가 있어  `Amazon Managed Grafana Workspace`를 사용하려면 SAML 인증을 구성해야하는데, SAML 인증 제어가 되면 검토해보겠습니다.  

<!-- [Monitoring CoreDNS in EKS with AMG](https://blog.mincloud.io/post/kans-9w-monitoring-codedns-in-eks-with-amg/)의 pre-requisite로, Amazon Managed Grafana Workspace를 훑어보았습니다.   -->

당연히 거의 4년이 다되가니 [Amazon Managed Grafana – Getting Started](https://aws.amazon.com/blogs/mt/amazon-managed-grafana-getting-started/)와는 다른 인터페이스를 확인할 수 있었습니다.  

현재 제 권한으로는 Organization을 생성할 수 없어서, Workspace만 생성해보았습니다.  
즉, ~~매우~~ 느슨한 권한으로 Workspace를 만들어주겠다 이것입니다.  

## 1. '딸깍'으로 시작하기  

- Getting Started with `딸깍`  

![amg-workspace](images/just-click-console.png)  

- 이름만 짓고, 넘어가 보겠습니다.  

![step1-ws-name](images/step1-ws-name.png)

- AWS ~~IIC~~ IAM Identity Center (구, AWS SSO)를 활용하겠습니다.  
  - ~~신경써야할게 많네요~~  

![step2-enable-sso](images/step2-enable-sso.png)

- 딸~깍, 유저를 만들어봅시다.  

![step2-create-user](images/step2-create-user.png)

- YEO-EUK-SHI... 될리가 없지요. IAM Identity Center 활성화부터 해야겠네요.  

![get-stuck-in-step2](images/get-stuck-in-step2.png)

## 2. IAM Identity Center 활성화 시도  

> 보통, 이때 조금 망했다는 생각이 들기 시작하죠  

- `IAM Identity Center` 메뉴에서 Enable을 `딸깍` 합니다.  

![click-enable-click](images/click-enable-click.png)  

- `Recommended` 싫은데요! 난 다른거 할 건데요! 하면 경고 엄청 날립니다.  

![stern-warning-not-recommended](images/stern-warning-not-recommended.png)  

```txt
- Users, groups, and AWS managed applications are isolated to this account instance.
  - 선택지 그대로, 현재 로그인한 계정에 격리된다고 합니다.  
- This account instance doesn't support granting users and groups access to - AWS accounts in an AWS organization.  
  - AWS Org.에 속한 계정에 권한 부여 안된다고 합니다.  
- This account instance can't be upgraded to become an organization instance.
  - `Recommended` 선택지로 업그레이드 안된다고 합니다.  
```  

- 알았어, 알았다고. 왼쪽을 선택하고 `Continue`를 `딸깍`  

![click-continue-with-recommended](images/click-continue-with-recommended.png)  

- 아 맞다, 주인님 허가 맡아야하지...  

![failed-with-insufficient-permission](images/failed-with-insufficient-permission.png)  

- 이미 경고 숙지했으니, 오른쪽 선택지로 `Continue`를 `딸깍`  
  - 한 5~10초 가량 소요  

![click-continue-without-recommended](images/click-continue-without-recommended.png)  

- 이제 뭘해야할까... ~~이대로 되는 것일까...~~  

![what-to-do-next](images/what-to-do-next.png)  

- 다시 시도!  

![retry](images/retry.png)  

- `UpdateSsoConfiguration` 권한 넣으라는 엄중한 지시...  
  - 애당초, 안되는 것 같아보이는데...  

![error-again](images/error-again.png)  

- 에라, Document 소환!  
  - Docs: [Use AWS IAM Identity Center with your Amazon Managed Grafana workspace](https://docs.aws.amazon.com/grafana/latest/userguide/authentication-in-AMG-SSO.html)  

- 아래 권한을 제게 다 넣어보겠습니다.  
  - AWSGrafanaAccountAdministrator  
  - AWSSSOMasterAccountAdministrator  
  - AWSOrganizationsFullAccess  
  - AWSSSODirectoryAdministrator  

![exodia-managed-permission](images/exodia-managed-permission.png)  

- 또 안되서, 인라인 하나만 넣어보고 안되면 던져야겠습니다.  

![UpdateSSOConfiguration](images/update-sso-configuration.png)  

- 아 그냥 안되는 거였네요. 일단 넘어가야겠네요.  

![you-are-not-allowed](images/you-are-not-allowed.png)  

## 3. SAML-based AMG

- SAML 인증으로 선택해보고 계속 생성시도 해보겠습니다.  

![use-saml-auth](images/use-saml-auth.png)  

- 다른 옵션은 아래와 같습니다.  

![amg-options](images/amg-options.png)

- 경고가 아찔한데...  

![need-more-permission-to-ams-prom](images/need-more-permission-to-ams-prom.png)

- Docs: [Amazon Managed Grafana permissions and policies for AWS data sources](https://docs.aws.amazon.com/grafana/latest/userguide/AMG-manage-permissions.html#AMG-service-managed-account)

![add-one-more-permission](images/add-one-more-permission.png)

- 에러는 없애지 못했지만, 워크스페이스 자체는 생성이 되었습니다. ~~찜찜~~  

![workspace-created](images/workspace-created.png)  

![amg-hello-world](images/amg-hello-world.png)  

## 4. SAML 설정  

- SAML의 경우, 제가 Admin인 SAML이 없어서 나중에 검토해볼 생각입니다.  

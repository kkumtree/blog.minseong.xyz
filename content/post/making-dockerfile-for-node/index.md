---
date: 2023-03-08T20:43:43+09:00
title: "Node.js를 위한 Dockerfile 만들기"
tags:
 - tag1
 - tag2
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho@ubuntu-kr.org
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png
draft: false # 글 초안 여부
---

## 새로 구축한 Dockerfile

```Dockerfile
FROM public.ecr.aws/lts/ubuntu:22.04_stable 

ENV DEBIAN_FRONTEND=noninteractive

# Set Preferred Variables
ARG TZ=Asia/Seoul \
    NODE_VER=18.x \
    UBUNTU_DIST=jammy \
    NPM_PKGS="cross-env pm2" \
    ADD_USG=kkumtree \
    ADD_USR=kkumtree \
    ADD_USR_LANG=C.UTF-8

ARG NODE_REPO=node_${NODE_VER}

# Apply essentials
RUN set -ex \
  && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
  && apt-get update -y > /dev/null 2>&1 \
  && apt-get install -y --no-install-recommends apt-utils > /dev/null 2>&1 \
  && apt-get install -y --no-install-recommends \
    tzdata \
    wget curl \
    ca-certificates openssl \
    lsb-release gnupg \
    gcc g++ make \
    zip unzip \
    vim \
    git \
    > /dev/null 2>&1 \
  && echo date

# Install env for runtime
# nodejs
RUN set -ex \
  && curl -sLf -o /dev/null \
    "https://deb.nodesource.com/${NODE_REPO}/dists/${UBUNTU_DIST}/Release" \
  && curl -s https://deb.nodesource.com/gpgkey/nodesource.gpg.key \
    | gpg --dearmor \
    | tee /usr/share/keyrings/nodesource.gpg \
    > /dev/null \
  && echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/${NODE_REPO} ${UBUNTU_DIST} main" \
    > /etc/apt/sources.list.d/nodesource.list \
  && echo "deb-src [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/${NODE_REPO} ${UBUNTU_DIST} main" \
    >> /etc/apt/sources.list.d/nodesource.list 

# Install runtime
# nodejs
RUN set -ex \
  && apt-get update > /dev/null \
  && apt-get install -y --no-install-recommends \
    nodejs \
    > /dev/null 2>&1 \
  && node -v \
  && npm -v \
  && npm install -g npm@latest \
  && npm -v \
  && npm install -g ${NPM_PKGS} \
  && npm update -g \
  && npm list -g \
  && rm -rf /var/lib/apt/lists/* \
    /var/cache/apt/* \
    /tmp/* \
    /var/tmp/* \
  && apt-get remove -yqq \
    tzdata \
    apt-utils \
  && apt-get clean autoremove -y \
  && apt-get autoclean -y \
  && npm cache clean --force \
  && npm cache verify 

# Add user
RUN groupadd -g 1000 ${ADD_USG}
RUN useradd -u 1000 -g ${ADD_USG} -M -s /bin/bash ${ADD_USG}
RUN mkdir -p /app && chown -R 1000:1000 /app

USER ${ADD_USR}
ENV LANG ${ADD_USR_LANG}

ENTRYPOINT ["/bin/bash"]
```

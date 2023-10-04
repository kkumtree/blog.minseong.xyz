---
date: 2023-07-25T00:40:14+09:00
title: "Init Calico from quay registry"
tags:
 - calico
 - k8s
authors:
    - name: kkumtree
      bio: plumber for infra
      email: mscho7969@ubuntu.com
      launchpad: mscho7969
      github: kkumtree
      profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png
draft: false
---


``` message
Written in 25 July 2023.
It could be different when you read this article.
```

## Error I met

I met error message like `Init:ImagePullBackOff` when I tried to create calico pod.

```bash
kubectl get pods --all-namespaces
NAMESPACE     NAME                                                     READY   STATUS                  RESTARTS   AGE   
kube-system   calico-kube-controllers-xxxxxxxxxx-yyyyy                 1/1     Running                 1          13h   
kube-system   calico-node-xxxxx                                        0/1     Init:ImagePullBackOff   0          13h
```

## Why it happened

Yes, it's because of changed docker hub policy.
Recently, I'm in an environment that about 20~30 people use 4 public IP addresses.
So, it's easy to reach docker hub pull rate limit.

```bash
kubectl describe pod calico-node-xxxxx -n kube-system
# Failed to pull image "calico/cni:v3.16.4": rpc error: code = Unknown desc = Error response from daemon: toomanyrequests: You have reached your pull rate limit. You may increase the limit by authenticating and upgrading: https://www.docker.com/increase-rate-limit
```

## How to solve

Solve this problem by using quay registry.
But, cause this way is not described in Docs, it was little bit hard to find out how to do it.

```bash
# install calico
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/tigera-operator.yaml

# To change image registry, get manifest file for custom resources
wget https://raw.githubusercontent.com/projectcalico/calico/v3.26.1/manifests/custom-resources.yaml

# change image registry
CALICO_ALTER_REGISTRY="quay.io/"; sed "0,/spec:/s|spec:|&\n  registry: $CALICO_ALTER_REGISTRY|" custom-resources.yaml

# apply manifest file
kubectl apply -f custom-resources.yaml
```

## etc

My colleague advised me to see Docs below,  
but It seems like taking some time.

- [k8s - Pull an Image from a Private Registry](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/)

## Reference

- [Github - Can not pull docker.io/calico/cni:v3.20.0](https://github.com/projectcalico/calico/issues/4918)  
- [Github - Use quay.io as default to mitigate dockerhub rate limit errors](https://github.com/projectcalico/calico/issues/4833)
- [Github - Switch the calico images to be pulled from quay.io](https://github.com/gardener/gardener-extension-networking-calico/pull/275)

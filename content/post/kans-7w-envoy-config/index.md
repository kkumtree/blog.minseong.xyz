---
date: 2024-10-19T16:59:16+09:00
title: "Kubernetes Service(4): envoy config"
tags:
 - kans
 - envoy
 - proxy
 - kubernetes
authors:
  - name: kkumtree
    bio: plumber for infra
    email: mscho7969@ubuntu.com
    launchpad: mscho7969
    github: kkumtree
    profile: https://avatars.githubusercontent.com/u/52643858?v=4 
image: cover.png # 커버 이미지 URL
draft: false # 글 초안 여부
---

정적/동적 설정을 알아봅니다.  
traefik을 맛볼때는, 호되게 데인 부분인데 envoy는 상대적으로 명료했습니다.  

[CloudNet@](https://gasidaseo.notion.site/CloudNet-Blog-c9dfa44a27ff431dafdd2edacc8a1863)에서 진행하고 있는 **K**8s **A**dvanced **N**etwork **S**tudy(이하, KANS)를 통해 학습한 내용을 정리합니다.  

## 1. Static Configuration

아래와 같이 구성됩니다.  

- static_resources
  - listeners  
  - clusters  

### (a) static_resources

envoy의 시작과 함께, 정적으로 설정되는 모든 리소스를 포함한다고 합니다.  
실제로 `envoy-demo.yaml` 파일을 열어보면 최상단에 `static_resources`이 선언되어 있습니다.  

```yaml
static_resources:

  listeners:
```

### (b) listeners  

`envoy-demo.yaml` 파일 기준,  

- `socket_address`: 리스너는 포트 10000에서 수신하도록 설정되어 있습니다.  
- `route_config`: 모든 경로에 대해 `service_envoyproxy_io` 클러스터로 라우팅합니다.  

```yaml
# cat envoy-demo.yaml | grep -A 30 -B 2 listeners
static_resources:

  listeners:
  - name: listener_0
    address:
      socket_address:
        address: 0.0.0.0
        port_value: 10000
    filter_chains:
    - filters:
      - name: envoy.filters.network.http_connection_manager
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          stat_prefix: ingress_http
          access_log:
          - name: envoy.access_loggers.stdout
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.access_loggers.stream.v3.StdoutAccessLog
          http_filters:
          - name: envoy.filters.http.router
            typed_config:
              "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
          route_config:
            name: local_route
            virtual_hosts:
            - name: local_service
              domains: ["*"]
              routes:
              - match:
                  prefix: "/"
                route:
                  host_rewrite_literal: www.envoyproxy.io
                  cluster: service_envoyproxy_io
```

### (c) clusters

`envoy-demo.yaml` 파일 기준,  

- `service_envoyproxy_io` 클러스터는 `www.envoyproxy.io`로 프록시합니다.  
- `TLS`를 사용하여 프록시합니다.  

```yaml
# cat envoy-demo.yaml | grep -A 18 clusters
  clusters:
  - name: service_envoyproxy_io
    type: LOGICAL_DNS
    # Comment out the following line to test on v6 networks
    dns_lookup_family: V4_ONLY
    load_assignment:
      cluster_name: service_envoyproxy_io
      endpoints:
      - lb_endpoints:
        - endpoint:
            address:
              socket_address:
                address: www.envoyproxy.io
                port_value: 443
    transport_socket:
      name: envoy.transport_sockets.tls
      typed_config:
        "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext
        sni: www.envoyproxy.io
```

## 2. xDS Comprenhensive Overview  

> 동적 설정으로 넘어가기 전에 envoy xDS를 이해하고자 하였습니다.  

[xDS](https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol#xds-protocol) 프로토콜을 구현하는 파일들을 사용해서 동적 구성을 할 수 있다고 합니다.  

- `xDS` 프로토콜: envoy가 동적 리소스를 검색할 때 해당 서비스와 API를 xDS로 총칭합니다.  

(1) 관찰할 파일명을 명시하거나, (2) gRPC 스트림을 시작하거나, 혹은 (3) REST-JSON API를 폴링해서 구현합니다. 이 중, 1항의 방법을 제외하고는 [DiscoveryResquest] Proto Payload와 함께 요청을 보내어 구현됩니다.  

- 'xDS' 프로토콜의 구분

|  | SotW | Incremental |  
| --- | :---: | :---: |  
| separeted gRPC | (a) | (b) |  
| single gRPC | (c) | (d) |  

**SotW**는 `Snapshot of the World`를 의미하며, 모든 리소스로 이해했습니다.  

(a) Basic xDS: 모든 리소스 유형에 대한, 별도의 gRPC 스트림
(b) Incremental xDS: 각 리소스 유형에 대한 중분, 별도의 gRPC 스트림
(c) Aggregated Discovery Service: 모든 리소스 유형에 대한, 단일 gRPC 스트림
(d) Incremental ADS: 각 리소스 유형에 대한 중분, 단일 gRPC 스트림

문서를 보고, 선명하게 이해가 오지 않아 매트릭스를 구성했는데도 뭔가 갸웃합니다.  

여하간, 증분을 사용하면 이전 상태와 상대 델타에만 적용할 수 있는 것 같습니다.  
gRPC 단일 스트림은 최종 일관성(멱등성?) 모델을 제공하고, 다중 스트림은 리소스의 [lazy loading](https://developer.mozilla.org/en-US/docs/Web/Performance/Lazy_loading)에 대응할 메커니즘이라고 합니다.  
~~야 이거 Firehose.... 음 아직도 좀 모호합니다~~  

## 3. Dynamic Configuration (from filesystem)  

[Runtime 값 런타임](https://www.envoyproxy.io/docs/envoy/latest/configuration/operations/runtime#updating-runtime-values-via-symbolic-link-swap) 설명이 별도로 있는데 좀 난해하네요.  

아래와 같이 구성됩니다.  

- `node` : 프록시 서버 식별  
- `dynamic_resources` : 동적 구성의 위치를 명시  
  - listeners
  - clusters

아래와 같이, 데모 파일을 받아봅시다.  

```bash
curl -O https://www.envoyproxy.io/docs/envoy/latest/_downloads/9a41bc513e17e885884b3deebf435d2a/envoy-dynamic-filesystem-demo.yaml
```

### (a) node

반드시 `cluster`와 `id`를 설정해야 합니다.

```yaml
# cat envoy-dynamic-filesystem-demo.yaml | grep -A 2 node:
node:
  cluster: test-cluster
  id: test-id
```

### (b) dynamic_resources

예제에서는 LDS와 CDS 데모파일을 사용합니다.  

```bash
curl -O https://www.envoyproxy.io/docs/envoy/latest/_downloads/5cf56125ff834c0e2f21f71e1e8916f2/envoy-dynamic-lds-demo.yaml
curl -O https://www.envoyproxy.io/docs/envoy/latest/_downloads/92bba5b0c48a649b4bc8663000cd097a/envoy-dynamic-cds-demo.yaml
```

- listeners: `envoy-dynamic-lds-demo.yaml`  

포트 10000에서 `HTTP` 리스너를 구성합니다.  
모든 도메인과 경로는 `service_envoyproxy_io` 클러스터로 라우팅합니다.  
`host` 헤더는 `www.envoyproxy.io`로 덮여씁니다.  

```yaml
# cat envoy-dynamic-lds-demo.yaml 
resources:
- "@type": type.googleapis.com/envoy.config.listener.v3.Listener
  name: listener_0
  address:
    socket_address:
      address: 0.0.0.0
      port_value: 10000
  filter_chains:
  - filters:
    - name: envoy.http_connection_manager
      typed_config:
        "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
        stat_prefix: ingress_http
        http_filters:
        - name: envoy.router
          typed_config:
            "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
        route_config:
          name: local_route
          virtual_hosts:
          - name: local_service
            domains:
            - "*"
            routes:
            - match:
                prefix: "/"
              route:
                host_rewrite_literal: www.envoyproxy.io
                cluster: example_proxy_cluster
```  

- clusters: `envoy-dynamic-cds-demo.yaml`  

`example_proxy_cluster` 클러스터는 `www.envoyproxy.io`로 TLS프록시합니다.  

```yaml
# cat envoy-dynamic-cds-demo.yaml
resources:
- "@type": type.googleapis.com/envoy.config.cluster.v3.Cluster
  name: example_proxy_cluster
  type: STRICT_DNS
  typed_extension_protocol_options:
    envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
      "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
      explicit_http_config:
        http2_protocol_options: {}
  load_assignment:
    cluster_name: example_proxy_cluster
    endpoints:
    - lb_endpoints:
      - endpoint:
          address:
            socket_address:
              address: www.envoyproxy.io
              port_value: 443
  transport_socket:
    name: envoy.transport_sockets.tls
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.UpstreamTlsContext
      sni: www.envoyproxy.io
```  

## 4. Dynamic Configuration (from Control Plane)

컨트롤 플레인의 구성을 envoy에게 전달하도록 설정해야하기에 뭔가 더 길게 써있습니다.  

이때, 컨트롤플레인은 Envoy API와 호환되는 Gloo 및 Istio 등을 지칭합니다.  

아래와 같은 구성이 필요합니다.

- `node` : 고유한 프록시 서버 식별  
- `dynamic_resources` : 동적으로 업데이트해야하는 구성을 envoy에게 명시  
- `static_resources` : 가져올 구성의 위치를 envoy에게 명시  

예제에서 사용할 데모 파일을 받아봅니다.  

```bash
curl -O https://www.envoyproxy.io/docs/envoy/latest/_downloads/fe2234c3a6762bdffb5300e299973700/envoy-dynamic-control-plane-demo.yaml
```

- `node`: 3-a와 동일합니다.  
- `dynamic_resources` : 동적 구성과 이 업데이트를 연결할 `cluster`를 명시합니다.  

아래 예시에서는 각 xDS 유형의 설정에 의해 구성이 제공됩니다.  

```yaml
# cat envoy-dynamic-control-plane-demo.yaml | grep -A 2 dynamic_resources:
dynamic_resources:
  ads_config:
    api_type: GRPC
    grpc_services:
    - envoy_grpc:
        cluster_name: xds_cluster
  cds_config:
    ads: {}
  lds_config:
    ads: {}
```

- `static_resources` : (말이 좀 이상하긴 한데) `동적`구성을 가져올 곳을 명시합니다.  

아래 예시에서는, `http://my-controle-plane:18000`에서 컨트롤 플레인을 찾도록 `xds_cluster` 에 정의되어 있습니다.  

```yaml
# cat envoy-dynamic-control-plane-demo.yaml | grep -A 17 static_resources:
static_resources:
  clusters:
  - type: STRICT_DNS
    typed_extension_protocol_options:
      envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
        "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
        explicit_http_config:
          http2_protocol_options: {}
    name: xds_cluster
    load_assignment:
      cluster_name: xds_cluster
      endpoints:
      - lb_endpoints:
        - endpoint:
            address:
              socket_address:
                address: my-control-plane
                port_value: 18000
```

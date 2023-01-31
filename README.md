[![Deploy Website](https://github.com/kkumtree/blog.minseong.xyz/actions/workflows/deploy.yml/badge.svg)](https://github.com/https://github.com/kkumtree/blog.minseong.xyz/actions/workflows/deploy.yml)

# blog.minseong.xyz

Built with [Hugo](https://gohugo.io) and [Vanilla - A simple, extensible CSS framework](https://vanillaframework.io/)

## License

MIT License (See `LICENSE`)

## 새 포스팅 추가하기

 [Hugo CLI](https://gohugo.io/getting-started/installing/) 를 설치하고, 이 명령줄 프로그램으로 새 포스팅을 생성합니다.

아래와 같은 명령으로 새 포스팅을 추가합니다. 명령으로 생성된 새 Markdown 파일을 수정하여 글을 작성합니다.
사진 등 첨부파일을 추가하려면, 글 본문인 담긴 `index.md` 와 동일한 디렉터리에 넣고 사용합니다.

```bash
# 포스팅 추가
hugo new --kind post post/<session-name>/index.md
# 예시: "UbuCon Asia 2023 후기" 라는 제목의 글 추가
hugo new --kind post post/ubucon-asia-2023-review/index.md

```

---
date: 2023-09-24T11:47:51+09:00
title: "Troubleshoot when using terraformer with tfenv"
tags:
 - Terraform
 - tfenv
 - terraformer
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

Removing & installing packages are some annoying, isn't it?
So, I like using version managers like SDKMAN, nvm, etc..  

I also use tfenv for terraform version management.  
(prev post: [KR/'Terraform 시작하기 w/Minimal Ubuntu'](https://kkumtree.github.io/post/terraform-hello-world-tfenv))

And I recommend neighbors to use [terraformer](https://github.com/GoogleCloudPlatform/terraformer) for first learning about terraform.  

terraformer is a great terraform generator tool for converting existing cloud infrastructure to terraform code.  

In this post, I write how I use terraformer with tfenv.

## 1. How to install `terraformer` in Linux

- After follow below, you can use terraformer with `terraformer` command!

```bash
export PROVIDER=aws 
# you can use other providers like 'google, kubernetes',
# Or if you want to use all providers, adjust 'all' instead of 'aws'
\curl -LO "https://github.com/GoogleCloudPlatform/terraformer/releases/download/$(curl -s https://api.github.com/repos/GoogleCloudPlatform/terraformer/releases/latest | grep tag_name | cut -d '"' -f 4)/terraformer-${PROVIDER}-linux-amd64"
chmod +x terraformer-${PROVIDER}-linux-amd64
sudo mv terraformer-${PROVIDER}-linux-amd64 /usr/local/bin/terraformer
```

## 2. Importing AWS VPC with terraformer

- After install terraformer, you can import AWS VPC with terraformer like below  
  (Also you can import other AWS resources like EC2, S3, etc..)

```bash
terraformer import aws --resources=vpc --regions=ap-northeast-2 
```

- But, error will happen... if you use tfenv like me.

```bash
$ terraformer import aws --resources=vpc --regions=ap-northeast-2
2023/09/24 12:03:53 aws importing region ap-northeast-2
2023/09/24 12:03:53 open /home/kkumtree/.terraform.d/plugins/linux_amd64: no such file or directory
$ whereis terraform
terraform: /home/kkumtree/.tfenv/bin/terraform
```

- As you can see, terraformer can't find terraform binary.  
  - Terraformer use terraform binary in `/home/kkumtree/.terraform.d/plugins/linux_amd64` but,  
  - tfenv use terraform binary in `/home/kkumtree/.tfenv/bin/terraform`.  

- So it needed to make a symbolic link to solve this problem  
  (But, It will makes me complicated in next year, I promise.)
  or... use some tricks like following.  

## 3. Problem solving

### (1) Make dummy file for executing terraformer

- Make dummy main.tf file in directory which you want to get terraform codes by terraformer.

```bash
mkdir ~/Documents/tf-aws-snapshot
cd ~/Documents/tf-aws-snapshot
cat <<EOF > main.tf
# heredoc> terraform {
# heredoc>   required_providers {
# heredoc>     aws = {
# heredoc>       source = "hashicorp/aws"
# heredoc>       version = "5.17.0"
# heredoc>     }
# heredoc>   }
# heredoc> }
cat main.tf
# terraform {
#   required_providers {
#     aws = {
#       source = "hashicorp/aws"
#       version = "5.17.0"
#     }
#   }
# }
```

- If you need, add specific region in main.tf

```terraform
terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      version = "5.17.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-2"
}
```

### (2) init terraform

- Init terraform with `terraform init` command
  - It uses tfenv's terraform binary

```bash
$ terraform init
Initializing the backend...

Initializing provider plugins...
- Finding hashicorp/aws versions matching "5.17.0"...
- Installing hashicorp/aws v5.17.0...
- Installed hashicorp/aws v5.17.0 (signed by HashiCorp)

Terraform has created a lock file .terraform.lock.hcl to record the provider
selections it made above. Include this file in your version control repository
so that Terraform can guarantee to make the same selections by default when
you run "terraform init" in the future.

Terraform has been successfully initialized!

You may now begin working with Terraform. Try running "terraform plan" to see
any changes that are required for your infrastructure. All Terraform commands
should now work.

If you ever set or change modules or backend configuration for Terraform,
rerun this command to reinitialize your working directory. If you forget, other
commands will detect it and remind you to do so if necessary.
```

- And check what happened in `.terraform` directory

```bash
$ tree -a
.
├── main.tf
├── .terraform
│   └── providers
│       └── registry.terraform.io
│           └── hashicorp
│               └── aws
│                   └── 5.17.0
│                       └── linux_amd64
│                           └── terraform-provider-aws_v5.17.0_x5
└── .terraform.lock.hcl

8 directories, 3 files
```

- As you see, terraform headless binary is installed in `.terraform` directory.  
  (It is not tfenv's terraform binary, but it is enough to use terraformer)

### (3) Import AWS VPC with terraformer

- Now, we can import AWS VPC with terraformer. Get ready to study with terraform codes!

```bash
$ terraformer import aws --resources=vpc --regions=ap-northeast-2
2023/09/24 12:30:39 aws importing region ap-northeast-2
2023/09/24 12:30:40 aws importing... vpc
2023/09/24 12:30:40 aws done importing vpc
2023/09/24 12:30:40 Number of resources for service vpc: 2
2023/09/24 12:30:40 Refreshing state... aws_vpc.tfer--vpc-xxxxxxxxxxxxxxxxx
2023/09/24 12:30:40 Refreshing state... aws_vpc.tfer--vpc-yyyyyyyyyyyyyyyyy
2023/09/24 12:30:41 Filtered number of resources for service vpc: 2
2023/09/24 12:30:41 aws Connecting.... 
2023/09/24 12:30:41 aws save vpc
2023/09/24 12:30:41 aws save tfstate for vpc
$ tree
.
├── generated
│   └── aws
│       └── vpc
│           ├── outputs.tf
│           ├── provider.tf
│           ├── terraform.tfstate
│           └── vpc.tf
└── main.tf

4 directories, 5 files
```

## 4. Conclusion

I was also in trouble with this situation.  
But references below helped me to solve this problem.  

## 5. References

- [GitHub/Getting error while running terraformer on google provider](https://github.com/GoogleCloudPlatform/terraformer/issues/1695#issuecomment-1536052978)  
- [Terraformer](https://github.com/GoogleCloudPlatform/terraformer)  

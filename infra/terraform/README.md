# Hook Pilot on AWS (Terraform)

Deploys Hook Pilot to AWS as two independently scaled ECS Fargate services:
an **API** behind an Application Load Balancer and **delivery workers**,
both backed by RDS Postgres and ElastiCache Redis (BullMQ).

```
                 Internet
                    │
           ┌────────▼────────┐  public subnets (2 AZs)
           │       ALB       │  HTTP → HTTPS when a certificate is set
           └────────┬────────┘
   ┌────────────────┼──────────────────────────────┐ private subnets
   │        ┌───────▼───────┐      ┌──────────────┐ │
   │        │  ECS: api     │      │ ECS: worker  │──┼──▶ NAT ──▶ customer
   │        │ (autoscaled)  │      │ (autoscaled) │ │         webhook endpoints
   │        └───┬───────┬───┘      └───┬──────┬───┘ │
   │            │       └──────┬───────┘      │     │
   │     ┌──────▼──────┐  ┌────▼─────────┐    │     │
   │     │ RDS Postgres│  │ ElastiCache  │◀───┘     │
   │     │ (encrypted) │  │ Redis (TLS)  │          │
   │     └─────────────┘  └──────────────┘          │
   └─────────────────────────────────────────────────┘
      Secrets Manager → DATABASE_URL, REDIS_URL
```

| File | Contents |
| --- | --- |
| `network.tf` | VPC, public/private subnets across 2 AZs, NAT, security groups |
| `data.tf` | RDS Postgres 16 and ElastiCache Redis 7 (`noeviction`, as BullMQ requires) |
| `secrets.tf` | Database and Redis connection strings (with generated passwords) in Secrets Manager |
| `ecs.tf` | ECR, ECS cluster, task definitions, services, IAM, CPU autoscaling |
| `alb.tf` | Load balancer, target group (`/health`), HTTP/HTTPS listeners |
| `environments/*.tfvars` | Sizing for `staging` (cheap, single-AZ) and `production` (multi-AZ) |

## Deploy from GitHub Actions

`.github/workflows/deploy.yml` (run manually from the Actions tab) creates the
ECR repository, builds and pushes the image tagged with the commit SHA, applies
Terraform, and smoke-tests `/health`. One-time setup:

1. An S3 bucket for Terraform state.
2. An IAM role that trusts GitHub's OIDC provider for this repository and can manage the resources above.
3. In the repository settings: secret `AWS_DEPLOY_ROLE_ARN`, variables `AWS_REGION` and `TF_STATE_BUCKET`.

## Deploy from your machine

```bash
cd infra/terraform
terraform init -backend-config="bucket=<state-bucket>" -backend-config="key=hook-pilot/staging.tfstate" -backend-config="region=eu-west-2"

# 1. Create the image repository, then push an image to it.
terraform apply -var-file=environments/staging.tfvars -target=aws_ecr_repository.app
REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build -t "$REPO:v1" ../.. && docker push "$REPO:v1"

# 2. Everything else.
terraform apply -var-file=environments/staging.tfvars -var image_tag=v1
terraform output api_url
```

## Notes

- The API runs migrations on boot under a Postgres advisory lock; workers never migrate.
- Workers get a 60s stop timeout so in-flight deliveries finish during deploys and scale-in.
- Deployments use the ECS circuit breaker and roll back automatically if new tasks fail health checks.
- `ALLOW_PRIVATE_NETWORKS=false` keeps the SSRF guard on in AWS.
- The API has no authentication: anyone who can reach the load balancer can use it. Restrict the `alb` security group to trusted IPs before deploying.
- Generated passwords are also stored in Terraform state, so keep the state bucket private and encrypted.
- Staging defaults cost roughly the price of a NAT gateway, an ALB and the smallest RDS/ElastiCache/Fargate sizes. Run `terraform destroy` when you are done showcasing.

environment = "production"
aws_region  = "eu-west-2"

# Set to an ACM certificate ARN for your domain to enable HTTPS.
certificate_arn = ""

single_nat_gateway = false

api_cpu          = 512
api_memory       = 1024
api_min_count    = 2
api_max_count    = 6
worker_cpu       = 512
worker_memory    = 1024
worker_min_count = 2
worker_max_count = 10

db_instance_class      = "db.t4g.small"
db_allocated_storage   = 50
db_multi_az            = true
db_deletion_protection = true

redis_node_type = "cache.t4g.small"
redis_replicas  = 1

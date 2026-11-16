environment = "staging"
aws_region  = "eu-west-2"

single_nat_gateway = true

api_min_count    = 1
api_max_count    = 2
worker_min_count = 1
worker_max_count = 3

db_instance_class      = "db.t4g.micro"
db_multi_az            = false
db_deletion_protection = false

redis_node_type = "cache.t4g.micro"
redis_replicas  = 0

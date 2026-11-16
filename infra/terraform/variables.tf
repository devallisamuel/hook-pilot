variable "project" {
  description = "Name prefix for every resource."
  type        = string
  default     = "hook-pilot"
}

variable "environment" {
  description = "Deployment environment, e.g. staging or production."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "environment must be lowercase letters, digits or dashes."
  }
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-west-2"
}

# --- Network -----------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Two public and two private /20 subnets are carved from it."
  type        = string
  default     = "10.40.0.0/16"
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for all private subnets (cheaper) instead of one per AZ (highly available)."
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "ACM certificate for HTTPS on the load balancer. Leave empty to serve plain HTTP (demo only)."
  type        = string
  default     = ""
}

# --- Application ---------------------------------------------------------------

variable "image_tag" {
  description = "Tag of the image in the ECR repository to deploy."
  type        = string
  default     = "latest"
}

variable "api_cpu" {
  type    = number
  default = 256
}

variable "api_memory" {
  type    = number
  default = 512
}

variable "api_min_count" {
  description = "Minimum number of API tasks."
  type        = number
  default     = 1
}

variable "api_max_count" {
  description = "Maximum number of API tasks under autoscaling."
  type        = number
  default     = 4
}

variable "worker_cpu" {
  type    = number
  default = 256
}

variable "worker_memory" {
  type    = number
  default = 512
}

variable "worker_min_count" {
  description = "Minimum number of delivery worker tasks."
  type        = number
  default     = 1
}

variable "worker_max_count" {
  description = "Maximum number of delivery worker tasks under autoscaling."
  type        = number
  default     = 6
}

variable "worker_concurrency" {
  description = "Concurrent deliveries per worker task."
  type        = number
  default     = 20
}

variable "delivery_retries" {
  description = "Extra calls made when an endpoint doesn't answer, before the delivery becomes UNCERTAIN."
  type        = number
  default     = 3
}

variable "log_retention_days" {
  type    = number
  default = 30
}

# --- Data stores -----------------------------------------------------------------

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Initial storage in GiB; storage autoscaling grows it up to 5x."
  type        = number
  default     = 20
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_deletion_protection" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "redis_replicas" {
  description = "Read replicas in addition to the primary. 1+ enables automatic failover."
  type        = number
  default     = 0
}

output "api_url" {
  description = "Public URL of the API (interactive docs at /docs)."
  value       = "${local.https_enabled ? "https" : "http"}://${aws_lb.api.dns_name}"
}

output "ecr_repository_url" {
  description = "Push images here; deploy them with -var image_tag=<tag>."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "database_endpoint" {
  value = aws_db_instance.main.endpoint
}

output "redis_endpoint" {
  value = aws_elasticache_replication_group.main.primary_endpoint_address
}

# Connection strings live in Secrets Manager and are injected into tasks by ECS;
# they never appear in task definitions or environment variables in plain text.
# Note: generated passwords are also stored in Terraform state, so keep the state
# bucket private and encrypted.

locals {
  app_secrets = {
    DATABASE_URL = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}?sslmode=no-verify"
    REDIS_URL    = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.main.primary_endpoint_address}:6379/0"
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.app_secrets

  name                    = "${local.name}/${each.key}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each = local.app_secrets

  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value
}

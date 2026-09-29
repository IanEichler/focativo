# Retenção dos contratos assinados

O PDF final é salvo uma única vez no bucket privado `contract-signatures`, sem sobrescrita, e em `SIGNING_ARCHIVE_DIR` na VPS. A assinatura só é concluída após ambas as gravações. O arquivo local usa o SHA-256 como nome e é publicado sem substituir arquivos existentes, com permissões 0600.

Em produção, usar `/var/lib/estoque-ia/signed-contracts`, dono `estoque`, modo 0700. Essa pasta fica fora de `releases` e não é removida pelo deploy. Definir a variável em `/etc/estoque-ia/web.env`. Não mover o arquivo para uma pasta temporária ou dentro do checkout. Incluir essa pasta e a configuração de assinatura no backup operacional da VPS; não apagar nem trocar `SIGNING_SECRET`, pois ela verifica evidências já assinadas.

O download confere o hash do PDF e o selo das evidências. Se o armazenamento Supabase falhar, usa a cópia local após validar o hash. Não existe conversão ou assinatura automática de um substituto. A expiração do link público de assinatura não expira o arquivo no perfil da cliente.

Para copiar e verificar contratos assinados antes desta mudança, executar como `estoque`, com o ambiente de produção carregado:

```sh
cd /opt/estoque-ia/current/apps/web
node --env-file=/etc/estoque-ia/web.env scripts/archive-signed-contracts.mjs
```

O comando não altera os contratos e imprime apenas as contagens de PDFs verificados nas duas cópias. É seguro executá-lo novamente.

Registros assinados e seus documentos têm proteção contra edição e exclusão no banco. Clientes com contratos assinados podem ser arquivados, mas não excluídos. Na interface, contratos assinados oferecem somente o download do PDF final. Um novo contrato é um documento independente, sem substituir o anterior.

Essas proteções impedem operações pela aplicação; administradores de infraestrutura ainda têm acesso ao disco e ao banco. As duas cópias reduzem o risco de perda, mas não substituem a política de backup e recuperação da infraestrutura.

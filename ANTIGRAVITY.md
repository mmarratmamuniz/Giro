# Migração para múltiplos clientes

## Estado inicial

O projeto usa Next.js 16 e Supabase. O banco original foi feito para uma única empresa. As políticas RLS de `schema.sql` e `migrations_level1.sql` permitem acesso irrestrito, inclusive anônimo. As funções de venda, cancelamento e exclusão de usuário usam `SECURITY DEFINER`. A aplicação fazia fallback de perfil ausente para administrador. Esses pontos precisam ser tratados antes de cadastrar um segundo cliente.

## Primeira etapa implementada

`supabase/20260918_multitenant_foundation.sql` cria `tenants`, atribui os registros existentes a Finish Bebidas, adiciona `tenant_id` a todas as tabelas operacionais, restringe RLS à empresa do perfil autenticado, adiciona chaves compostas entre registros da mesma empresa e substitui as funções de venda e cancelamento. O navegador não escolhe a empresa: ela vem do perfil associado a `auth.uid()`.

O cadastro automático a partir de metadados do usuário e a antiga função de exclusão foram removidos na migração. Os botões de cadastro e exclusão na tela de usuários estão desabilitados até existir um fluxo seguro no servidor. O login exige perfil com empresa e o guard bloqueia usuários sem vínculo.

## Aplicação da migração

1. Faça backup do banco e valide em uma cópia isolada. Execute `schema.sql`, `migrations_level1.sql` e `delete_user_rpc.sql` apenas quando estiver montando um banco novo; num banco atual, confirme que o esquema de nível 1 já foi aplicado.
2. Ajuste o nome da empresa inicial no `INSERT INTO public.tenants` e execute `20260918_multitenant_foundation.sql` uma única vez no SQL Editor do Supabase. Não reaplique os scripts legados depois dela.
3. Verifique que todos os registros antigos receberam o mesmo `tenant_id` e que os perfis existentes têm vínculo. Confirme vendas, cancelamentos, caixa e estoque com contas já existentes.
4. Em um banco de teste, crie uma segunda empresa e dois usuários de teste pelo painel administrativo do Supabase; associe cada perfil pelo serviço administrativo, nunca pelo cliente web. Verifique que um usuário não lista, altera nem vincula produtos, vendas, caixa, compras ou perfis da outra empresa. Teste também RPCs com IDs de outra empresa, quantidades negativas, itens repetidos e dois caixas concorrentes.

## Próximas tarefas para o Antigravity

1. Criar convite e provisionamento no servidor, autenticando um administrador da empresa e atribuindo `tenant_id` e `role` exclusivamente no servidor. Não aceitar `tenant_id` ou `role` de metadados enviados pelo browser. Reativar os botões somente com esse fluxo.
2. Criar exclusão de usuário com autorização de administrador, escopo por empresa e controle do último administrador. Evitar manipular `auth.users` por uma função RPC acessível ao cliente.
3. Revisar operações multipartes de compra e caixa: hoje várias gravações acontecem em requisições separadas. Mover para funções transacionais no banco e conferir empresa em cada relacionamento.
4. Gerar tipos Supabase atualizados para todas as tabelas e funções, incluindo as tabelas de caixa, e executar lint/build. Adicionar testes reais de RLS em banco com dois clientes antes de produção.
5. Planejar a interface de criação de empresas, configuração de marca e onboarding sem confiar em identificadores enviados pelo browser.

Esta etapa é uma base de migração; não execute o SQL diretamente em produção sem os testes de isolamento e backup acima.

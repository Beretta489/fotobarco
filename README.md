# 🐬 FotoBarco — Sistema de Venda de Fotos de Passeios Turísticos

> Sistema desenvolvido para a **Jangalancha Show** — automatiza a venda de fotos de passeios turísticos em modo quiosque (tablet), sem necessidade de intervenção humana.

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
- [Casos de Uso](#casos-de-uso)
- [Fluxo Operacional](#fluxo-operacional)
- [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Como Instalar e Rodar](#como-instalar-e-rodar)
- [Manual do Administrador](#manual-do-administrador)
- [Bot do Telegram](#bot-do-telegram)
- [Pacotes e Preços](#pacotes-e-preços)
- [Roadmap](#roadmap)

---

## Visão Geral

O FotoBarco é um sistema de quiosque para tablets que permite aos clientes da Jangalancha Show visualizar e comprar as fotos tiradas durante o passeio de barco. O sistema é totalmente automatizado — desde o recebimento das fotos pelo marinheiro até a entrega do link de download ao cliente via WhatsApp.

**Diferenciais:**
- Zero intervenção do atendente no processo de venda
- Fotos organizadas automaticamente por passeio e família
- Pagamento via Pix com confirmação automática
- Limpeza automática das fotos às 23h todo dia
- Criação automática de sessões às 08h30

---

## Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend (Tablet) | React Native + Expo |
| Backend / Banco de Dados | Supabase (PostgreSQL + Storage) |
| Bot de Fotos | Node.js + Telegram Bot API |
| Agendamento | node-cron |
| Pagamento (pendente) | EFI Bank (Pix + Cartão) |
| Envio WhatsApp (pendente) | Z-API |
| Hospedagem Bot (pendente) | Railway / Render |

---

## Arquitetura do Sistema

```
┌─────────────────────┐     ┌──────────────────────┐
│  Marinheiro          │     │  Tablet (Quiosque)   │
│  (Celular/Telegram)  │     │  React Native + Expo │
└────────┬────────────┘     └──────────┬───────────┘
         │                             │
         │ Envia foto                  │ Busca fotos
         ▼                             ▼
┌─────────────────────┐     ┌──────────────────────┐
│  Bot do Telegram     │────▶│  Supabase            │
│  (Node.js)           │     │  - sessions          │
│  - Recebe fotos      │     │  - groups            │
│  - Faz upload        │     │  - photos            │
│  - Cron 08:30/23:00  │     │  - orders            │
└─────────────────────┘     │  - order_items       │
                             │  - Storage (fotos)   │
                             └──────────────────────┘
```

---

## Casos de Uso

### UC01 — Cliente visualiza e compra fotos

**Ator:** Cliente (turista)

**Pré-condição:** O marinheiro já enviou as fotos para o grupo do Telegram correspondente.

**Fluxo principal:**
1. Cliente chega ao tablet após o passeio
2. Seleciona o horário do passeio que fez
3. Visualiza as miniaturas dos grupos de família
4. Reconhece suas fotos e clica no grupo correspondente
5. Visualiza todas as fotos do passeio em galeria
6. Clica em "Quero comprar minhas fotos"
7. Seleciona o pacote desejado (Completo, Metade ou Avulso)
8. Se pacote Metade ou Avulso: seleciona as fotos desejadas
9. Revisa o resumo do pedido
10. Digita o número de celular para receber o link
11. Realiza o pagamento via Pix
12. Recebe o link de download no WhatsApp

**Pós-condição:** Pedido registrado no banco, fotos disponíveis por 30 dias.

---

### UC02 — Marinheiro envia fotos durante o passeio

**Ator:** Marinheiro (fotógrafo)

**Pré-condição:** Bot do Telegram ativo e rodando no servidor.

**Fluxo principal:**
1. Marinheiro tira fotos de uma família durante o passeio
2. Abre o grupo do Telegram correspondente (ex: "9:00 Familia 3")
3. Envia as fotos no grupo
4. Bot recebe automaticamente e faz upload para o Supabase
5. Fotos ficam disponíveis imediatamente no tablet

**Pós-condição:** Fotos salvas no Supabase Storage organizadas por sessão e grupo.

---

### UC03 — Sistema cria sessões automaticamente

**Ator:** Bot (sistema)

**Fluxo principal:**
1. Todo dia às 08:30 o bot executa o cron job
2. Cria automaticamente as 6 sessões do dia:
   - Passeio 09:00
   - Passeio 10:15
   - Passeio 11:45
   - Passeio 13:30
   - Passeio 14:45
   - Passeio 16:00
3. Sessões ficam ativas para receber fotos

---

### UC04 — Sistema limpa fotos ao final do dia

**Ator:** Bot (sistema)

**Fluxo principal:**
1. Todo dia às 23:00 o bot executa a limpeza
2. Remove todas as fotos do Supabase Storage
3. Apaga registros de fotos, grupos e sessões do banco
4. Sistema fica limpo para o dia seguinte

---

### UC05 — Administrador acessa o painel

**Ator:** Administrador (funcionário autorizado)

**Pré-condição:** Número de celular cadastrado na tabela `authorized_phones`.

**Fluxo principal:**
1. Administrador acessa "Área Administrativa" na tela inicial
2. Digita o número de celular
3. Sistema verifica se o número está autorizado
4. Acesso liberado ao painel
5. Administrador pode:
   - Ver dashboard com vendas do dia
   - Criar sessões manualmente
   - Adicionar grupos às sessões
   - Fazer upload de fotos manualmente
   - Encerrar sessões

---

## Fluxo Operacional

```
DIA A DIA:

08:30 ──▶ Bot cria sessões automaticamente

Durante o passeio:
Marinheiro ──▶ Envia fotos no Telegram ──▶ Bot processa ──▶ Supabase

Após o passeio:
Cliente ──▶ Tablet ──▶ Seleciona horário ──▶ Seleciona família
       ──▶ Galeria de fotos ──▶ Escolhe pacote ──▶ Digita celular
       ──▶ Paga Pix ──▶ Recebe link no WhatsApp

23:00 ──▶ Bot limpa todas as fotos do dia
```

---

## Estrutura do Banco de Dados

### sessions
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| name | text | Ex: "Passeio 09:00" |
| scheduled_at | timestamptz | Horário do passeio |
| active | boolean | Se está ativo |
| created_at | timestamptz | Data de criação |

### groups
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| session_id | uuid | FK → sessions |
| name | text | Ex: "Familia 1" |
| telegram_group_id | text | ID do grupo no Telegram |
| created_at | timestamptz | Data de criação |

### photos
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| session_id | uuid | FK → sessions |
| group_id | uuid | FK → groups |
| url | text | URL pública da foto |
| storage_path | text | Caminho no Storage |
| price | numeric | Preço unitário (R$ 15,00) |
| created_at | timestamptz | Data de criação |

### orders
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| session_id | uuid | FK → sessions |
| group_id | uuid | FK → groups |
| total | numeric | Valor total do pedido |
| status | text | pending / paid |
| package_type | text | all / half / single |
| client_phone | text | Celular do cliente |
| download_token | text | Token do link de download |
| download_expires_at | timestamptz | Expiração do link (30 dias) |
| paid_at | timestamptz | Data do pagamento |
| created_at | timestamptz | Data de criação |

### order_items
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| order_id | uuid | FK → orders |
| photo_id | uuid | FK → photos |

### authorized_phones
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | uuid | Chave primária |
| phone | text | Número autorizado |
| name | text | Nome do administrador |
| created_at | timestamptz | Data de criação |

---

## Estrutura do Projeto

```
FotoBarco/
├── assets/                    # Imagens e ícones
│   ├── golfinho_final.png     # Mascote do sistema
│   └── LogoJanga.webp         # Logo da Jangalancha Show
│
├── bot/                       # Bot do Telegram (Node.js)
│   ├── bot.js                 # Código principal do bot
│   ├── package.json
│   └── .env                   # Credenciais (não versionado)
│
├── navigation/
│   └── AppNavigator.js        # Configuração de rotas
│
├── screens/                   # Telas do aplicativo
│   ├── WelcomeScreen.js       # Tela inicial
│   ├── SelectGroupScreen.js   # Seleção de horário e família
│   ├── PhotoGalleryScreen.js  # Galeria de fotos
│   ├── PackageSelectScreen.js # Seleção de pacote
│   ├── SelectPhotosScreen.js  # Seleção de fotos (metade/avulso)
│   ├── CheckoutScreen.js      # Resumo do pedido
│   ├── PhoneScreen.js         # Inserção do celular
│   ├── PaymentScreen.js       # Pagamento via Pix
│   ├── ConfirmationScreen.js  # Confirmação do pedido
│   ├── AdminLoginScreen.js    # Login do administrador
│   └── AdminDashboardScreen.js # Painel administrativo
│
├── services/                  # Integração com Supabase
│   ├── supabase.js            # Cliente Supabase
│   ├── auth.js                # Autenticação
│   ├── sessions.js            # Gestão de sessões e grupos
│   ├── photos.js              # Gestão de fotos
│   └── orders.js              # Gestão de pedidos
│
├── utils/
│   └── theme.js               # Cores e estilos globais
│
├── App.js                     # Entrada do aplicativo
├── app.json                   # Configuração do Expo
└── .gitignore
```

---

## Como Instalar e Rodar

### Pré-requisitos
- Node.js v20+
- Expo CLI
- Conta no Supabase

### Instalação

```bash
# Clone o repositório
git clone https://github.com/Beretta489/fotobarco.git
cd FotoBarco

# Instale as dependências do app
npm install

# Instale as dependências do bot
cd bot
npm install
cd ..
```

### Configuração do Supabase

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute o SQL em `supabase/schema.sql`
3. Crie um bucket `photos` no Storage (público)
4. Copie a URL e a chave anon

### Variáveis de Ambiente

Crie o arquivo `app.json` com as credenciais no campo `extra`:

```json
"extra": {
  "supabaseUrl": "https://SEU_PROJETO.supabase.co",
  "supabaseAnonKey": "SUA_CHAVE_ANON"
}
```

Crie o arquivo `bot/.env`:

```env
BOT_TOKEN=SEU_TOKEN_DO_TELEGRAM
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA_CHAVE_ANON
```

### Rodando o App

```bash
# Web (desenvolvimento)
npx expo start --web

# Android
npx expo start --android
```

### Rodando o Bot

```bash
cd bot
node bot.js
```

---

## Manual do Administrador

### Acesso ao Painel

1. Na tela inicial, clique em **"Área Administrativa"** (rodapé discreto)
2. Digite o número de celular cadastrado (formato: 5584999998888)
3. Clique em **"ENTRAR"**

### Autorizar novos administradores

Execute no SQL Editor do Supabase:

```sql
INSERT INTO authorized_phones (phone, name)
VALUES ('5584999998888', 'Nome do Admin');
```

### Dashboard

A aba **Dashboard** mostra:
- Faturamento total do dia
- Número de pedidos realizados
- Quantidade de fotos vendidas
- Lista dos últimos pedidos com horário, celular e valor

### Gerenciar Sessões

A aba **Sessões** permite:
- Ver sessões ativas do dia
- Expandir cada sessão para ver os grupos
- Fazer upload de fotos para cada grupo
- Adicionar novos grupos a uma sessão
- Encerrar sessões

### Criar Sessão Manualmente

A aba **Nova Sessão** mostra os 6 horários do dia. Clique em qualquer horário para criar a sessão correspondente. Sessões já criadas aparecem com ✓ em verde.

---

## Bot do Telegram

### Grupos configurados

O bot monitora 42 grupos fixos (6 passeios × 7 famílias):

| Passeio | Grupos |
|---------|--------|
| 09:00 | Familia 1 a 7 |
| 10:15 | Familia 1 a 7 |
| 11:45 | Familia 1 a 7 |
| 13:30 | Familia 1 a 7 |
| 14:45 | Familia 1 a 7 |
| 16:00 | Familia 1 a 7 |

### Funcionamento automático

| Horário | Ação |
|---------|------|
| 08:30 | Cria as 6 sessões do dia |
| Durante o dia | Processa fotos enviadas nos grupos |
| 23:00 | Apaga todas as fotos e encerra sessões |

### Como adicionar o bot a um grupo

1. Abra o grupo no Telegram
2. Clique em **Add Members**
3. Pesquise por `@FotoJanga_bot`
4. Adicione e promova a **Admin**

---

## Pacotes e Preços

| Pacote | Descrição | Preço |
|--------|-----------|-------|
| 📦 Completo | Todas as fotos do passeio | R$ 100,00 |
| 🎯 Metade | Escolha metade das fotos | R$ 60,00 |
| 🖼️ Avulso | Fotos individuais | R$ 15,00/foto |

---

## Roadmap

### ✅ Implementado
- App React Native completo (todas as telas)
- Integração com Supabase
- Bot do Telegram com upload automático
- Limpeza automática às 23h
- Criação automática de sessões às 08h30
- Autenticação admin por número de celular
- Dashboard de vendas

### ⏳ Pendente
- [ ] Hospedagem do bot (Railway/Render)
- [ ] Pagamento Pix real (EFI Bank)
- [ ] Pagamento cartão de crédito (EFI Bank)
- [ ] Envio automático via WhatsApp (Z-API)
- [ ] Build APK para tablets Android
- [ ] Remoção de credenciais do código (variáveis de ambiente)

---

## Licença

Projeto privado — desenvolvido exclusivamente para a **Jangalancha Show**.

© 2026 Jangalancha Show. Todos os direitos reservados.
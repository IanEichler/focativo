import type { Metadata } from "next";
import Link from "next/link";
import { PageContainer, PageHeader, SectionHeader } from "@/components/layout/page";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Como usar" };

interface TopicLink {
  id: string;
  title: string;
}

const TOPICS: TopicLink[] = [
  { id: "clientes", title: "Clientes" },
  { id: "agenda", title: "Agenda" },
  { id: "servicos-horarios", title: "Serviços e Horários" },
  { id: "produtos-estoque", title: "Produtos e Estoque" },
  { id: "reservas", title: "Reservas" },
  { id: "vendas", title: "Vendas" },
  { id: "financeiro-relatorios", title: "Financeiro e Relatórios" },
  { id: "usuarios", title: "Usuários e permissões" },
  { id: "configuracoes", title: "Configurações" },
  { id: "menu", title: "Menu lateral" },
];

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-body text-muted-foreground">{children}</p>;
}

function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-muted-foreground">{children}</ul>;
}

function Topic({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-section text-foreground">{title}</h2>
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

export default function HelpPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Como usar"
        description="Guia rápido de cada parte do sistema. Atualizado sempre que uma funcionalidade muda."
      />

      <Card>
        <CardContent>
          <SectionHeader title="Índice" className="mb-3" />
          <nav aria-label="Índice do guia">
            <ul className="grid gap-x-6 gap-y-1.5 text-body sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((topic) => (
                <li key={topic.id}>
                  <Link href={`#${topic.id}`} className="text-primary hover:underline">
                    {topic.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </CardContent>
      </Card>

      <Topic id="clientes" title="Clientes">
        <P>Cadastro central de contatos, com histórico de compras, reservas, agendamentos e contratos.</P>
        <P>
          Telefone é obrigatório no cadastro; WhatsApp e e-mail continuam opcionais. Telefone e WhatsApp são formatados
          sozinhos enquanto você digita, e compartilham o mesmo número — um telefone já usado por um cliente não pode
          virar o WhatsApp de outro (nem vice-versa), pra nunca duplicar. A busca da lista de clientes encontra por
          nome, telefone, e-mail ou CPF.
        </P>
        <P>Duas ações bem diferentes, de propósito:</P>
        <Ul>
          <li>
            <strong>Arquivar</strong> — some das listas ativas, mas continua tudo salvo; reversível a qualquer momento
            (“Reativar”).
          </li>
          <li>
            <strong>Excluir</strong> — apaga de vez. Só funciona se o cliente não
            tiver reserva, venda ou agendamento real associado (nesses casos, só arquivar). Exige digitar o nome exato
            do cliente pra confirmar.
          </li>
        </Ul>
      </Topic>

      <Topic id="agenda" title="Agenda">
        <P>Lista de agendamentos (compromissos marcados), com status: agendado, confirmado, concluído, cancelado.</P>
        <P>
          Um agendamento nunca sobrepõe outro do mesmo profissional no mesmo horário — o sistema bloqueia sozinho.
          Também respeita o horário de funcionamento e as exceções cadastradas (ver “Serviços e Horários” abaixo).
        </P>
      </Topic>

      <Topic id="servicos-horarios" title="Serviços e Horários">
        <P>
          Dentro de <strong>Agenda → Serviços e Horários</strong> há duas abas:
        </P>
        <Ul>
          <li>
            <strong>Serviços</strong> — catálogo do que é oferecido (nome, duração, preço, descrição). Cada serviço tem
            também <strong>restrições</strong> (texto livre, ex.: “não recomendado para gestantes”).
          </li>
          <li>
            <strong>Horários</strong> — horário de funcionamento por dia da semana (sem configurar nada, o padrão é
            aberto o tempo todo), e <strong>exceções</strong>: cada profissional registra suas próprias folgas pontuais
            (não precisa reativar no dia seguinte — a ausência do registro já significa disponível de novo).
          </li>
        </Ul>
      </Topic>

      <Topic id="produtos-estoque" title="Produtos e Estoque">
        <P>
          <strong>Produtos</strong> é o catálogo (nome, variações, preço). <strong>Estoque</strong> registra entradas e
          saídas — toda movimentação fica no histórico, nada é apagado ou editado depois de lançado.
        </P>
      </Topic>

      <Topic id="reservas" title="Reservas">
        <P>
          Separa produto pro cliente antes da venda, travando o preço atual e o estoque disponível. É criada
          manualmente, na tela de Reservas.
        </P>
      </Topic>

      <Topic id="vendas" title="Vendas">
        <P>Registro de vendas concluídas, com forma de pagamento e itens vendidos.</P>
      </Topic>

      <Topic id="financeiro-relatorios" title="Financeiro e Relatórios">
        <P>
          <strong>Financeiro</strong> mostra o resumo de entradas/saídas. <strong>Relatórios</strong> traz visões
          agregadas (vendas por período, produtos mais vendidos, etc.).
        </P>
      </Topic>

      <Topic id="usuarios" title="Usuários e permissões">
        <P>
          Convide membros da equipe por e-mail e defina o papel de cada um: Proprietário, Administrador, Gerente ou
          Vendedor — cada papel já vem com um conjunto de permissões (o que pode ver e o que pode alterar).
        </P>
      </Topic>

      <Topic id="configuracoes" title="Configurações">
        <P>Dados cadastrais da empresa: nome, documento, endereço, fuso horário.</P>
      </Topic>

      <Topic id="menu" title="Menu lateral">
        <P>
          Arraste um item do menu pra cima ou pra baixo pra reordenar dentro da mesma seção (não dá pra mover entre
          seções) — a ordem escolhida fica salva só pra você, os outros usuários da empresa não são afetados. O botão no
          topo da barra lateral recolhe o menu, deixando só os ícones.
        </P>
      </Topic>
    </PageContainer>
  );
}

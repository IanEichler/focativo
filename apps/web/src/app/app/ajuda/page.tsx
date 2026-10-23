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
  { id: "contratos", title: "Contratos" },
  { id: "financeiro-cliente", title: "Financeiro da cliente" },
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

      <Topic id="contratos" title="Contratos">
        <P>
          No perfil da cliente, aba <strong>Contratos</strong>, escolha o modelo e preencha os campos. Os dados que já
          estão no cadastro vêm preenchidos (dá pra corrigir).
        </P>
        <Ul>
          <li>
            <strong>Prévia ao lado</strong>: o contrato aparece montado enquanto você digita, com o mesmo modelo que
            vai virar PDF e Word. Campo ainda em branco aparece como “________”.
          </li>
          <li>
            <strong>Nome do procedimento</strong>: ao clicar, aparecem os serviços cadastrados em Serviços e Horários.
            Se o procedimento não estiver cadastrado, é só digitar outro nome.
          </li>
          <li>
            <strong>Parcelas no Financeiro</strong>: com valor final, número de parcelas e vencimento preenchidos, o
            formulário mostra as parcelas (uma por mês). Elas entram no Financeiro da cliente quando o contrato é
            <strong> assinado</strong>; gerar o contrato de novo não duplica cobrança.
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

      <Topic id="financeiro-cliente" title="Financeiro da cliente">
        <P>
          No perfil da cliente, aba <strong>Financeiro</strong>: total lançado, recebido, em aberto e em atraso, com a
          lista de parcelas.
        </P>
        <Ul>
          <li>
            <strong>Marcar como pago</strong>: informe a data e a forma de pagamento.
          </li>
          <li>
            <strong>Editar parcela</strong>: muda valor, vencimento ou forma de pagamento de uma parcela em aberto.
          </li>
          <li>
            <strong>Estornar</strong>: desfaz um pagamento marcado por engano; a parcela volta a ficar em aberto.
          </li>
          <li>
            <strong>Cancelar</strong>: a parcela deixa de ser cobrada. Parcela paga nunca é apagada.
          </li>
          <li>
            <strong>Novo lançamento</strong>: para sessão avulsa ou contrato antigo; divide o valor total em parcelas
            mensais.
          </li>
        </Ul>
        <P>Tudo fica registrado no histórico da cliente.</P>
      </Topic>

      <Topic id="financeiro-relatorios" title="Financeiro e Relatórios">
        <P>
          <strong>Financeiro</strong> reúne as parcelas de todas as clientes, mês a mês (use as setas para trocar de
          mês):
        </P>
        <Ul>
          <li>
            <strong>Recebido no mês</strong> conta pelo dia do pagamento; <strong>A receber</strong> e{" "}
            <strong>Previsto</strong> contam pelo vencimento; <strong>Em atraso</strong> soma todas as parcelas vencidas.
          </li>
          <li>
            <strong>Precisa de atenção</strong> lista as parcelas atrasadas e as que vencem hoje, com o botão de dar
            baixa. O sino no topo também avisa.
          </li>
          <li>
            Filtre as parcelas do mês por situação ou pelo nome da cliente; o nome leva ao Financeiro dela.
          </li>
          <li>
            <strong>Novo lançamento</strong> funciona como no perfil da cliente, escolhendo a cliente no formulário.
          </li>
        </Ul>
        <P>
          <strong>Relatórios</strong> traz visões agregadas do que estiver ligado no sistema.
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

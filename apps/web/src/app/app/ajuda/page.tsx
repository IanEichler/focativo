import { Bell, Check, CheckCheck, CircleCheck, Download, Plus, UserX, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MoneyValue } from "@/components/data/money-value";
import { StatusBadge } from "@/components/data/status-badge";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { calendarDate } from "@/domains/agenda/calendar";
import { BarList } from "@/domains/financial/components/bar-list";
import { CashFlowChart } from "@/domains/financial/components/cash-flow-chart";
import { shiftMonth } from "@/domains/financial/period";
import type { CashFlowMonth } from "@/domains/financial/queries";
import { Bullets, Example, Faq, InfoTable, Step, Steps, Sub, Text, Tip, Topic, Ui } from "./help-ui";

export const metadata: Metadata = { title: "Como usar" };

const TOPICS = [
  { id: "comecando", title: "Primeiros passos" },
  { id: "preparar", title: "Preparar o sistema" },
  { id: "clientes", title: "Clientes" },
  { id: "contratos", title: "Contratos" },
  { id: "agenda", title: "Agenda" },
  { id: "receber", title: "Financeiro: a receber" },
  { id: "despesas", title: "Financeiro: despesas" },
  { id: "fluxo-relatorios", title: "Fluxo de caixa e relatórios" },
  { id: "rotina", title: "Rotina sugerida" },
  { id: "duvidas", title: "Dúvidas frequentes" },
  { id: "campos", title: "Campos do modelo de contrato" },
];

/** Meses de exemplo para o gráfico do fluxo de caixa, centrados no mês atual. */
function demoCashFlow(currentMonth: string): CashFlowMonth[] {
  const income = [4200, 4800, 5400, 6000, 6600, 3100, 0, 0, 0, 0, 0, 0];
  const incomeOpen = [0, 0, 0, 400, 0, 2600, 5200, 4500, 3800, 3100, 2400, 1700];
  const expense = [3100, 3500, 3100, 3500, 3100, 2900, 0, 0, 0, 0, 0, 0];
  const expenseOpen = [0, 0, 0, 0, 0, 650, 3300, 3300, 3300, 3300, 3300, 3300];
  return income.map((_, index) => ({
    month: shiftMonth(currentMonth, index - 5),
    incomePaid: income[index]!,
    incomeOpen: incomeOpen[index]!,
    expensePaid: expense[index]!,
    expenseOpen: expenseOpen[index]!,
  }));
}

function DemoButton({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <Button size="sm" variant={primary ? "default" : "outline"}>
      {children}
    </Button>
  );
}

export default function HelpPage() {
  const currentMonth = calendarDate(new Date(), "America/Cuiaba").slice(0, 7);

  return (
    <PageContainer>
      <PageHeader
        title="Como usar"
        description="Passo a passo de cada parte do sistema. Os quadros “Exemplo” mostram a tela com dados fictícios."
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-section text-foreground">Primeira vez aqui?</h2>
            <p className="text-body text-muted-foreground">
              Faça os capítulos 1 e 2 na ordem: em poucos minutos a clínica fica pronta para contratos, agenda e
              financeiro. Depois, use o índice para consultar quando precisar.
            </p>
          </div>
          <nav aria-label="Índice do guia">
            <ol className="grid gap-x-6 gap-y-1.5 text-body sm:grid-cols-2 lg:grid-cols-3">
              {TOPICS.map((topic, index) => (
                <li key={topic.id} className="flex gap-2">
                  <span className="w-5 text-right text-muted-foreground tabular">{index + 1}.</span>
                  <Link href={`#${topic.id}`} className="text-primary hover:underline">
                    {topic.title}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </CardContent>
      </Card>

      {/* 1 */}
      <Topic
        id="comecando"
        number={1}
        title="Primeiros passos"
        intro="O sistema funciona no navegador do computador ou do celular, sem instalar nada."
      >
        <Sub title="O sino de avisos">
          <Text>
            No canto superior direito, o <Bell className="inline size-4 align-text-bottom" /> mostra o que precisa de
            atenção. Clique no aviso para ir direto à tela certa.
          </Text>
          <Example caption="avisos do sino">
            <ul className="flex flex-col divide-y divide-border text-body">
              {[
                { label: "Parcelas atrasadas", count: 2, tone: "bg-danger" },
                { label: "Parcelas vencendo hoje", count: 1, tone: "bg-warning" },
                { label: "Sessões de contrato sem horário na agenda", count: 1, tone: "bg-warning" },
                { label: "Compromissos hoje", count: 6, tone: "bg-info" },
              ].map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${item.tone}`} />
                    {item.label}
                  </span>
                  <span className="font-medium tabular">{item.count}</span>
                </li>
              ))}
            </ul>
          </Example>
        </Sub>
        <Sub title="Menu e perfil">
          <Bullets>
            <li>
              Arraste os itens do menu lateral para mudar a ordem (vale só para você). O botão no topo recolhe o menu.
            </li>
            <li>
              No seu nome, no canto superior direito: <Ui>Meu perfil</Ui>, tema claro ou escuro e <Ui>Sair</Ui>.
            </li>
            <li>
              Esqueceu a senha? Na tela de entrada, <Ui>Esqueci minha senha</Ui>.
            </li>
          </Bullets>
        </Sub>
      </Topic>

      {/* 2 */}
      <Topic
        id="preparar"
        number={2}
        title="Preparar o sistema"
        intro="Feito uma vez, no começo. Esses dados alimentam os contratos, a agenda e o financeiro."
        href="/app/agenda/servicos"
        hrefLabel="Serviços e Horários"
      >
        <Steps>
          <Step>
            <strong className="text-foreground">Dados da clínica</strong>: em <Ui>Configurações</Ui>, confira razão
            social, CNPJ, telefone, e-mail e fuso horário (Cuiabá). Razão social e CNPJ entram sozinhos nos contratos.
          </Step>
          <Step>
            <strong className="text-foreground">Serviços</strong>: em <Ui>Serviços e Horários</Ui> →{" "}
            <Ui>Novo serviço</Ui>, informe nome, duração, preço e quem atende. O preço é o valor cobrado quando um
            atendimento avulso é confirmado na agenda.
          </Step>
          <Step>
            <strong className="text-foreground">Horários</strong>: na aba Horários, defina os dias e horas de
            funcionamento e registre as folgas de cada profissional. A agenda não aceita horários fora disso.
          </Step>
          <Step>
            <strong className="text-foreground">Equipe</strong>: em <Ui>Usuários</Ui>, use <Ui>Convidar usuário</Ui> (a
            pessoa cria a senha pelo e-mail) ou <Ui>Criar usuário</Ui> (você define a senha). <em>Administrador</em> vê
            tudo; <em>Funcionário</em> não vê o Financeiro (dá para liberar depois nas permissões).
          </Step>
          <Step>
            <strong className="text-foreground">Modelos de contrato</strong>: os modelos da clínica já estão cadastrados
            e aparecem na aba Contratos de cada cliente. Precisa de um modelo novo ou de uma mudança no texto? Peça ao
            suporte, enviando o contrato em Word (.docx) — os campos que o sistema preenche estão no capítulo 11.
          </Step>
        </Steps>
        <Example caption="trecho de um modelo Word">
          <p className="text-body leading-relaxed">
            Eu, <code className="rounded bg-muted px-1">{"{cliente_nome}"}</code>, CPF{" "}
            <code className="rounded bg-muted px-1">{"{cliente_cpf}"}</code>, contrato o pacote{" "}
            <code className="rounded bg-muted px-1">{"{pacote_nome}"}</code> por R${" "}
            <code className="rounded bg-muted px-1">{"{valor_final}"}</code> em{" "}
            <code className="rounded bg-muted px-1">{"{numero_parcelas}"}</code> parcelas, com 1º vencimento em{" "}
            <code className="rounded bg-muted px-1">{"{vencimento}"}</code>.
          </p>
        </Example>
        <Tip title="Dica">
          Os nomes dos serviços aparecem como sugestão no campo “Nome do procedimento” dos contratos. Cadastre-os do
          jeito que devem aparecer no contrato.
        </Tip>
      </Topic>

      {/* 3 */}
      <Topic
        id="clientes"
        number={3}
        title="Clientes"
        intro="Cada cliente tem um perfil com tudo que é dela: dados, contratos e financeiro."
        href="/app/clientes"
        hrefLabel="Clientes"
      >
        <Steps>
          <Step>
            Em <Ui>Clientes</Ui>, clique em <Ui>Novo cliente</Ui>. Só nome e telefone são obrigatórios; o resto pode ser
            completado depois, ou pelo próprio contrato.
          </Step>
          <Step>
            Ache a cliente pela busca (nome, telefone, e-mail ou CPF) e abra o perfil: abas <Ui>Visão geral</Ui>,{" "}
            <Ui>Contratos</Ui> e <Ui>Financeiro</Ui>.
          </Step>
        </Steps>
        <InfoTable
          head={["Ação", "O que acontece"]}
          rows={[
            [
              "Arquivar",
              "Some das listas, mas tudo fica salvo. Dá para reativar. É o caminho certo na maioria dos casos.",
            ],
            [
              "Excluir",
              "Apaga de vez. Só para quem não tem contrato assinado nem agendamento; pede o nome para confirmar.",
            ],
          ]}
        />
      </Topic>

      {/* 4 */}
      <Topic
        id="contratos"
        number={4}
        title="Contratos"
        intro="O contrato vira PDF e Word, é assinado por link e, na assinatura, o sistema agenda as sessões e lança as parcelas sozinho."
      >
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            ["1. Preencher", "Dados, valores, parcelas e sessões, com a prévia ao lado."],
            ["2. Gerar", "PDF e Word salvos no perfil da cliente."],
            ["3. Enviar o link", "A cliente lê e assina pelo celular."],
            ["4. Assinado", "Sessões na Agenda e parcelas no Financeiro."],
          ].map(([title, text], index) => (
            <div
              key={title}
              className={
                index === 3
                  ? "rounded-lg bg-foreground p-3 text-small text-background"
                  : "rounded-lg border border-border p-3 text-small text-muted-foreground"
              }
            >
              <p className={index === 3 ? "font-semibold" : "font-semibold text-foreground"}>{title}</p>
              <p>{text}</p>
            </div>
          ))}
        </div>

        <Sub title="Preencher e gerar">
          <Steps>
            <Step>
              Abra a cliente → aba Contratos → no modelo, <Ui>Preencher contrato</Ui>. O que já está no cadastro vem
              preenchido (correções de dados pessoais atualizam o cadastro ao gerar).
            </Step>
            <Step>
              Preencha pacote, procedimentos, valores e datas, acompanhando a{" "}
              <strong className="text-foreground">prévia ao lado</strong>. Campo ainda vazio aparece como “________”. No{" "}
              <em>Nome do procedimento</em>, aparecem os serviços cadastrados.
            </Step>
            <Step>
              Com valor final, número de parcelas e vencimento preenchidos, confira o quadro{" "}
              <strong className="text-foreground">Parcelas no Financeiro</strong>.
            </Step>
            <Step>
              Deixe marcado “Salvar o arquivo do contrato no perfil” e clique em <Ui>Gerar PDF e Word</Ui>.
            </Step>
          </Steps>
          <Example caption="quadro Parcelas no Financeiro">
            <div className="flex flex-col gap-2 text-body">
              <p className="font-medium">Parcelas no Financeiro</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked className="size-4" /> Lançar as parcelas no Financeiro da cliente
                quando o contrato for assinado
              </label>
              <ul className="flex flex-col divide-y divide-border">
                {[
                  ["1/3 · vence 10/11/2026", 600],
                  ["2/3 · vence 10/12/2026", 600],
                  ["3/3 · vence 10/01/2027", 600],
                ].map(([label, value]) => (
                  <li key={label} className="flex justify-between py-1.5">
                    <span>{label}</span>
                    <MoneyValue value={value as number} />
                  </li>
                ))}
              </ul>
            </div>
          </Example>
          <Tip title="Gerar de novo não duplica nada">
            As parcelas e as sessões só são lançadas quando o contrato é assinado. Pode gerar quantas vezes precisar
            para corrigir.
          </Tip>
        </Sub>

        <Sub title="Sessões na agenda">
          <Text>
            Em cada sessão do contrato, preencha{" "}
            <strong className="text-foreground">data, horário, serviço e profissional</strong>. Para pacotes, use o
            quadro <strong className="text-foreground">Preencher sessões de uma vez</strong>:
          </Text>
          <Steps>
            <Step>
              Informe a 1ª sessão, a frequência (toda semana, a cada 2, 3 ou 4 semanas, ou todo mês), quantas sessões, o
              horário, o serviço e a profissional.
            </Step>
            <Step>
              Clique em <Ui>Preencher sessões</Ui>. Todas são preenchidas e abertas para conferir.
            </Step>
            <Step>
              Ajuste alguma exceção (um feriado, por exemplo). Região e observações já digitadas são mantidas.
            </Step>
          </Steps>
        </Sub>

        <Sub title="Assinatura pelo link">
          <Steps>
            <Step>
              Ao gerar, o link já é criado: clique em <Ui>Copiar link de assinatura</Ui> e envie à cliente (WhatsApp,
              e-mail…). Ele vale 7 dias; depois, use <Ui>Gerar e copiar link</Ui>.
            </Step>
            <Step>
              A cliente abre no celular, lê o contrato, digita o nome completo, pode desenhar a assinatura e confirma.
            </Step>
            <Step>
              Com a situação <em>Assinado</em>, <Ui>Baixar contrato e comprovante</Ui> traz o PDF assinado.
            </Step>
          </Steps>
          <Example caption="situações da assinatura">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="neutral">Não solicitado</StatusBadge>
              <StatusBadge tone="warning">Aguardando assinatura</StatusBadge>
              <StatusBadge tone="neutral">Link expirado</StatusBadge>
              <StatusBadge tone="neutral">Link cancelado</StatusBadge>
              <StatusBadge tone="success">Assinado</StatusBadge>
            </div>
          </Example>
          <Tip tone="warn" title="Contrato assinado no papel">
            Nesse caso nada é lançado sozinho: crie as parcelas em Novo lançamento (capítulo 6) e as sessões em Novo
            agendamento (capítulo 5).
          </Tip>
        </Sub>
      </Topic>

      {/* 5 */}
      <Topic
        id="agenda"
        number={5}
        title="Agenda"
        intro="Os atendimentos por dia ou semana, sempre no horário de Cuiabá."
        href="/app/agenda"
        hrefLabel="Agenda"
      >
        <Steps>
          <Step>
            Clique em <Ui>Novo agendamento</Ui> e escolha cliente, serviço, profissional, data e horário. O sistema
            bloqueia dois atendimentos da mesma profissional no mesmo horário, horário fechado e folga.
          </Step>
          <Step>Use Dia ou Semana e as setas para navegar; filtre por profissional ou situação.</Step>
          <Step>No menu de cada agendamento, marque o que aconteceu:</Step>
        </Steps>
        <InfoTable
          head={["Ação", "Quando", "No Financeiro"]}
          rows={[
            [
              <span key="c" className="inline-flex items-center gap-1.5">
                <Check className="size-4" /> Confirmar
              </span>,
              "A cliente confirmou",
              "Cria a cobrança com o preço do serviço",
            ],
            [
              <span key="d" className="inline-flex items-center gap-1.5">
                <CheckCheck className="size-4" /> Concluir
              </span>,
              "Atendimento feito",
              "Cria a cobrança, se ainda não houver",
            ],
            [
              <span key="n" className="inline-flex items-center gap-1.5">
                <UserX className="size-4" /> Não compareceu
              </span>,
              "A cliente faltou",
              "Cancela a cobrança em aberto",
            ],
            [
              <span key="x" className="inline-flex items-center gap-1.5">
                <X className="size-4" /> Cancelar
              </span>,
              "Não vai acontecer",
              "Cancela a cobrança em aberto",
            ],
          ]}
        />
        <Text>
          Sessões de contrato e serviços sem preço não geram cobrança (já estão nas parcelas do contrato). Cobrança já
          paga nunca é cancelada sozinha.
        </Text>
        <Tip title="Sessões de contratos que precisam de ajuste">
          Se, na assinatura, algum horário do contrato já estava ocupado, a sessão aparece no topo da Agenda com o
          motivo (e o sino avisa). Clique em <Ui>Resolver agendamento</Ui> e escolha outro horário.
        </Tip>
      </Topic>

      {/* 6 */}
      <Topic
        id="receber"
        number={6}
        title="Financeiro: a receber"
        intro="Tudo que as clientes devem à clínica, mês a mês. Também aparece no perfil de cada cliente, aba Financeiro."
        href="/app/financeiro"
        hrefLabel="Financeiro"
      >
        <Text>
          As cobranças chegam de três lugares: contrato assinado, atendimento confirmado na agenda e lançamento feito à
          mão.
        </Text>
        <Sub title="Dar baixa (registrar que recebeu)">
          <Steps>
            <Step>
              Na parcela, clique em <Ui>Marcar como pago</Ui>.
            </Step>
            <Step>
              Confira a data do pagamento e escolha a forma: Pix, dinheiro, cartão de crédito ou débito, boleto,
              transferência.
            </Step>
            <Step>Confirme. A parcela passa a “Pago em …” e entra nos números e relatórios.</Step>
          </Steps>
          <Example caption="parcelas na lista">
            <ul className="flex flex-col divide-y divide-border text-body">
              {[
                {
                  name: "Ana Souza",
                  desc: "Pacote facial · Parcela 2/3",
                  due: "05/10/2026",
                  value: 600,
                  badge: <StatusBadge tone="danger">Atrasado</StatusBadge>,
                  pay: true,
                },
                {
                  name: "Carla Lima",
                  desc: "Limpeza de pele · 26/10 14:00",
                  due: "26/10/2026",
                  value: 180,
                  badge: <StatusBadge tone="warning">Vence hoje</StatusBadge>,
                  pay: true,
                },
                {
                  name: "Júlia Melo",
                  desc: "Laser · Parcela 1/4",
                  due: "10/11/2026",
                  value: 350,
                  badge: <StatusBadge tone="info">Em aberto</StatusBadge>,
                  pay: true,
                },
                {
                  name: "Paula Reis",
                  desc: "Pacote facial · Parcela 1/3",
                  due: "05/09/2026",
                  value: 600,
                  badge: <StatusBadge tone="success">Pago em 05/09/2026</StatusBadge>,
                  pay: false,
                },
              ].map((row) => (
                <li key={row.name} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-48 flex-col">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {row.desc} · vence {row.due}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <MoneyValue value={row.value} />
                    {row.badge}
                    {row.pay && (
                      <DemoButton>
                        <CircleCheck /> Marcar como pago
                      </DemoButton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Example>
        </Sub>
        <Sub title="Os números do mês">
          <InfoTable
            head={["Número", "Como é contado"]}
            rows={[
              ["Recebido no mês", "O que foi pago no mês, pelo dia do pagamento."],
              ["A receber no mês", "O que vence no mês e ainda está em aberto."],
              ["Previsto no mês", "Tudo que vence no mês, pago ou não."],
              ["Em atraso", "Tudo que já venceu e não foi pago, de qualquer mês."],
            ]}
          />
          <Text>
            Use as setas para trocar de mês. <strong className="text-foreground">Precisa de atenção</strong> lista as
            atrasadas e as do dia; as parcelas do mês podem ser filtradas por situação ou pelo nome da cliente.
          </Text>
        </Sub>
        <Sub title="Outras ações (menu ⋯ da parcela)">
          <InfoTable
            head={["Ação", "Quando usar"]}
            rows={[
              ["Editar parcela", "Mudar valor, vencimento ou forma prevista de uma parcela em aberto."],
              ["Estornar pagamento", "Desfazer uma baixa feita por engano. A parcela volta a ficar em aberto."],
              ["Cancelar parcela", "A parcela não será mais cobrada (desconto, desistência). Não dá para desfazer."],
            ]}
          />
          <Text>
            <Ui>
              <Plus className="mr-1 size-3.5" /> Novo lançamento
            </Ui>{" "}
            serve para sessão avulsa paga na hora ou contrato antigo: informe cliente, descrição, valor total, número de
            parcelas e 1º vencimento, e o sistema divide por mês.
          </Text>
        </Sub>
      </Topic>

      {/* 7 */}
      <Topic
        id="despesas"
        number={7}
        title="Financeiro: despesas"
        intro="As contas a pagar da clínica. Funciona como o “a receber”: mesmos números e mesma baixa."
        href="/app/financeiro?aba=despesas"
        hrefLabel="Despesas"
      >
        <Steps>
          <Step>
            Clique em <Ui>Nova despesa</Ui>: descrição, categoria (escolha da lista ou digite uma nova), valor, parcelas
            e vencimento.
          </Step>
          <Step>
            Conta que se repete todo mês (aluguel, luz, internet)? Marque{" "}
            <strong className="text-foreground">Despesa fixa</strong> e informe o valor por mês e o 1º vencimento. As
            próximas são criadas sozinhas, no mesmo dia.
          </Step>
          <Step>
            Para parar uma fixa, clique no <X className="inline size-4 align-text-bottom" /> no quadro Despesas fixas: a
            conta do mês atual continua; as próximas são canceladas.
          </Step>
        </Steps>
        <Tip title="Conta fixa com valor diferente num mês">
          Edite a parcela daquele mês. Se o valor mudar de vez, encerre a fixa e crie outra.
        </Tip>
      </Topic>

      {/* 8 */}
      <Topic
        id="fluxo-relatorios"
        number={8}
        title="Fluxo de caixa e relatórios"
        intro="Para enxergar os próximos meses e fechar cada mês com números."
        href="/app/financeiro?aba=fluxo"
        hrefLabel="Fluxo de caixa"
      >
        <Sub title="Fluxo de caixa">
          <Text>
            Os últimos 5 meses, o atual e os próximos 6. Em cada mês, a coluna azul são as entradas e a âmbar, as
            saídas: a parte <strong className="text-foreground">cheia</strong> já foi paga; a{" "}
            <strong className="text-foreground">listrada</strong> ainda está prevista (parcelas a receber e contas,
            incluindo as despesas fixas). Passe o mouse para ver os valores.
          </Text>
          <Example caption="gráfico do fluxo de caixa">
            <CashFlowChart months={demoCashFlow(currentMonth)} currentMonth={currentMonth} />
          </Example>
        </Sub>
        <Sub title="Relatórios e planilha para o contador">
          <Steps>
            <Step>
              Em Financeiro → <Ui>Relatórios</Ui>, escolha o período: este mês, mês passado, 3, 6 ou 12 meses, ou este
              ano.
            </Step>
            <Step>
              Veja recebido, despesas pagas, resultado e inadimplência (do que venceu até ontem, quanto ainda não foi
              pago), além da receita por procedimento, por forma de pagamento e das despesas por categoria.
            </Step>
            <Step>
              Clique em{" "}
              <Ui>
                <Download className="mr-1 size-3.5" /> Exportar planilha (CSV)
              </Ui>{" "}
              e abra no Excel: vem tudo que venceu ou foi pago no período, pronto para o contador.
            </Step>
          </Steps>
          <Example caption="receita por procedimento">
            <BarList
              tone="in"
              emptyText=""
              countLabel={(count) => `${count} ${count === 1 ? "pagamento" : "pagamentos"}`}
              groups={[
                { label: "Pacote facial", amount: 4800, count: 8 },
                { label: "Limpeza de pele", amount: 2250, count: 15 },
                { label: "Laser", amount: 1400, count: 7 },
              ]}
            />
          </Example>
        </Sub>
      </Topic>

      {/* 9 */}
      <Topic
        id="rotina"
        number={9}
        title="Rotina sugerida"
        intro="Poucos minutos por dia mantêm agenda e caixa em dia."
      >
        <InfoTable
          head={["Quando", "O que fazer"]}
          rows={[
            [
              "Todo dia",
              "Olhar o sino · confirmar a agenda · marcar Concluir ou Não compareceu · dar baixa no que receber",
            ],
            [
              "Toda semana",
              "Cobrar as atrasadas (Precisa de atenção) · resolver sessões de contrato pendentes · conferir contas a pagar",
            ],
            ["Todo mês", "Relatório do mês passado · exportar a planilha para o contador · olhar o fluxo de caixa"],
          ]}
        />
      </Topic>

      {/* 10 */}
      <Topic id="duvidas" number={10} title="Dúvidas frequentes" intro="Situações comuns do dia a dia.">
        <div className="flex flex-col gap-2">
          <Faq question="A cliente pagou um valor diferente da parcela.">
            Antes de dar baixa, use Editar parcela e ajuste o valor. Depois, Marcar como pago.
          </Faq>
          <Faq question="Dei baixa na parcela errada.">Estorne o pagamento nela e dê baixa na parcela certa.</Faq>
          <Faq question="O atendimento avulso foi cobrado com o preço do serviço, mas cobrei outro valor.">
            Edite a parcela antes de dar baixa.
          </Faq>
          <Faq question="A cliente vai remarcar uma sessão do contrato.">
            Cancele o agendamento e crie outro no novo horário. As parcelas do contrato não mudam.
          </Faq>
          <Faq question="O link de assinatura expirou.">
            No perfil da cliente, aba Contratos, clique em Gerar e copiar link e envie de novo.
          </Faq>
          <Faq question="Uma sessão do contrato não apareceu na agenda.">
            Veja no topo da Agenda as “Sessões de contratos que precisam de ajuste”. Confira também se o contrato foi
            assinado pelo link (contrato em papel não agenda sozinho).
          </Faq>
          <Faq question="Uma funcionária não vê o Financeiro.">
            É o esperado para o perfil Funcionário. Se ela precisar, ajuste as permissões dela em Usuários.
          </Faq>
          <Faq question="Não consigo excluir uma cliente.">
            Clientes com contrato assinado ou agendamentos não podem ser excluídas, para não perder histórico. Use
            Arquivar.
          </Faq>
        </div>
      </Topic>

      {/* 11 */}
      <Topic
        id="campos"
        number={11}
        title="Campos do modelo de contrato"
        intro="Referência para pedir um modelo novo ao suporte: no Word, cada campo vai entre chaves, como {cliente_nome}. Qualquer outro nome vira um campo livre no formulário."
      >
        <InfoTable
          head={["Campo", "Conteúdo"]}
          rows={[
            ["{cliente_nome} · {cliente_cpf} · {cliente_rg}", "Dados da cliente (vêm do cadastro)"],
            [
              "{cliente_data_nascimento} · {cliente_telefone} · {cliente_email} · {cliente_profissao}",
              "Mais dados da cliente",
            ],
            ["{cliente_endereco} · {cliente_cidade_uf} · {cliente_cep}", "Endereço (o CEP preenche cidade e rua)"],
            [
              "{empresa_nome} · {empresa_cnpj} · {empresa_telefone} · {empresa_email}",
              "Dados da clínica (de Configurações)",
            ],
            ["{pacote_nome}", "Nome do pacote (vira a descrição das parcelas)"],
            ["{valor_bruto} · {desconto} · {valor_final}", "Valores do contrato"],
            ["{forma_pagamento} · {numero_parcelas} · {valor_parcela} · {vencimento}", "Pagamento e parcelas"],
            [
              "{data_contratacao} · {data_assinatura} · {data_assinatura_extenso}",
              "Datas (a por extenso é automática)",
            ],
            [
              "{item_1_procedimento} · {item_1_regiao} · {item_1_sessoes} · {item_1_valor_sessao} · {item_1_valor_total}",
              "Procedimentos (troque o 1 por 2, 3…)",
            ],
            [
              "{sessao_1_data} · {sessao_1_regiao} · {sessao_1_observacoes}",
              "Sessões (com horário, serviço e profissional, vão para a agenda)",
            ],
          ]}
        />
        <Text>
          Campos que começam ou terminam com “assinatura” (como {"{assinatura_cliente}"}) ficam em branco no documento,
          para a assinatura.
        </Text>
      </Topic>
    </PageContainer>
  );
}

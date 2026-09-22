"use client";

import { Bell, ChevronDown, Info, Moon, Plus, Search, Sun, Trash2, Upload } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { Suspense } from "react";
import { toast } from "sonner";
import { useIsClient } from "@/hooks/use-is-client";
import { SearchInput } from "@/components/data/filter-controls";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { SectionHeader } from "@/components/layout/page";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema só é conhecido no cliente; antes de hidratar renderiza o mesmo que o servidor.
  const mounted = useIsClient();
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function InteractiveShowcase() {
  return (
    <>
      <section className="flex flex-col gap-5">
        <SectionHeader title="Botões" />
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button>
                <Plus /> Novo produto
              </Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">
                <Upload /> Importar
              </Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">
                <Trash2 /> Excluir
              </Button>
              <Button variant="link">Link</Button>
              <Button disabled>
                <Spinner /> Salvando…
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Pequeno</Button>
              <Button>Padrão</Button>
              <Button size="lg">Grande</Button>
              <Button size="icon-sm" variant="outline" aria-label="Notificações">
                <Bell />
              </Button>
              <Button size="icon" variant="outline" aria-label="Buscar">
                <Search />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeader title="Campos" />
        <Card>
          <CardContent className="grid gap-5 md:grid-cols-2">
            <TextField label="Nome do produto" name="ds-name" placeholder="Whey Isolado 900g" required />
            <TextField
              label="Preço de venda"
              name="ds-price"
              inputMode="decimal"
              placeholder="R$ 0,00"
              description="Use vírgula para centavos."
            />
            <TextField
              label="Código de barras"
              name="ds-barcode"
              error="Código de barras já cadastrado."
              defaultValue="7891234567890"
            />
            <SelectField
              label="Categoria"
              name="ds-category"
              defaultValue="proteinas"
              options={[
                { value: "proteinas", label: "Proteínas" },
                { value: "creatinas", label: "Creatinas" },
                { value: "vitaminas", label: "Vitaminas" },
              ]}
            />
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label htmlFor="ds-notes" className="text-body font-medium">
                Observações
              </Label>
              <Textarea id="ds-notes" placeholder="Informações internas…" rows={3} />
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-body font-medium">Busca</span>
              <Suspense fallback={null}>
                <SearchInput param="ds_q" placeholder="Buscar produtos…" />
              </Suspense>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-body font-medium">Seleção</span>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox defaultChecked /> Controlar estoque por lote
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Switch defaultChecked /> Produto ativo
              </Label>
              <RadioGroup defaultValue="true" className="flex gap-4" aria-label="Contém lactose">
                {[
                  { value: "true", label: "Contém" },
                  { value: "false", label: "Não contém" },
                  { value: "unknown", label: "Não informado" },
                ].map((option) => (
                  <Label key={option.value} className="flex items-center gap-2 font-normal">
                    <RadioGroupItem value={option.value} /> {option.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeader title="Sobreposições" description="Dropdown, popover, tooltip, dialog, drawer e toast." />
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Ações <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Produto</DropdownMenuLabel>
                <DropdownMenuItem>Editar</DropdownMenuItem>
                <DropdownMenuItem>Duplicar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline">Popover</Button>
              </PopoverTrigger>
              <PopoverContent className="text-body">Conteúdo contextual curto, como filtros rápidos.</PopoverContent>
            </Popover>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Ajuda">
                  <Info />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Disponível = físico − reservado</TooltipContent>
            </Tooltip>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar reserva</DialogTitle>
                  <DialogDescription>1× Whey Isolado 900g — Chocolate · R$ 139,90</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Reservar</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline">Drawer</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Novo cliente</SheetTitle>
                  <SheetDescription>Drawers são usados para criar e editar sem sair da tela.</SheetDescription>
                </SheetHeader>
                <div className="flex flex-col gap-4 px-4">
                  <TextField label="Nome" name="ds-customer" />
                  <TextField label="WhatsApp" name="ds-phone" type="tel" />
                </div>
                <SheetFooter>
                  <SheetClose asChild>
                    <Button>Salvar</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Button variant="outline" onClick={() => toast.success("Reserva criada.")}>
              Toast de sucesso
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.error("Não foi possível concluir esta reserva porque a disponibilidade do produto mudou.")
              }
            >
              Toast de erro
            </Button>
            <span className="ml-auto inline-flex items-center gap-1.5 text-small text-muted-foreground">
              Paleta de comandos <Kbd>Ctrl K</Kbd>
            </span>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeader title="Abas e avatares" />
        <Card>
          <CardContent className="flex flex-col gap-6">
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="caracteristicas">Características</TabsTrigger>
                <TabsTrigger value="estoque">Estoque</TabsTrigger>
              </TabsList>
              <TabsContent value="dados" className="pt-3 text-body text-muted-foreground">
                Informações gerais do produto.
              </TabsContent>
              <TabsContent value="caracteristicas" className="pt-3 text-body text-muted-foreground">
                Sem lactose · 24g proteína · Chocolate
              </TabsContent>
              <TabsContent value="estoque" className="pt-3 text-body text-muted-foreground">
                12 disponíveis · 2 reservados
              </TabsContent>
            </Tabs>
            <div className="flex -space-x-2">
              {["JS", "MS", "CL", "AP"].map((value) => (
                <Avatar key={value} className="size-9 border-2 border-card">
                  <AvatarFallback className="bg-secondary text-caption font-semibold">{value}</AvatarFallback>
                </Avatar>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

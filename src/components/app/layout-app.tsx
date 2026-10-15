import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldAlert,
  Sun,
  Upload,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ROTULOS_PAPEL, useAuth } from "@/lib/auth";
import { usePendentesCount } from "@/lib/consultas";

import { BuscaGlobal } from "./busca-global";

interface ItemMenu {
  para: string;
  rotulo: string;
  icone: LucideIcon;
}

const MENU: ItemMenu[] = [
  { para: "/dashboard", rotulo: "Dashboard", icone: LayoutDashboard },
  { para: "/unidades", rotulo: "Unidades Consumidoras", icone: Building2 },
  { para: "/importar", rotulo: "Importar XML", icone: Upload },
  { para: "/faturas", rotulo: "Faturas", icone: FileText },
  { para: "/solar", rotulo: "Energia Solar (GD)", icone: Sun },
  { para: "/alertas", rotulo: "Análises e Alertas", icone: ShieldAlert },
  { para: "/relatorios", rotulo: "Relatórios", icone: BarChart3 },
  { para: "/historico", rotulo: "Histórico de Importações", icone: History },
  { para: "/configuracoes", rotulo: "Configurações", icone: Settings },
];

function MenuLateral() {
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const { data: pendentes } = usePendentesCount();
  const { setOpenMobile, isMobile } = useSidebar();
  const fechar = () => isMobile && setOpenMobile(false);

  return (
    <SidebarMenu>
      {MENU.map((item) => {
        const ativo = caminho === item.para || caminho.startsWith(`${item.para}/`);
        return (
          <SidebarMenuItem key={item.para}>
            <SidebarMenuButton asChild isActive={ativo} tooltip={item.rotulo}>
              <Link to={item.para} onClick={fechar}>
                <item.icone />
                <span>{item.rotulo}</span>
              </Link>
            </SidebarMenuButton>
            {item.para === "/faturas" && (
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={caminho === "/pendencias"}>
                    <Link to="/pendencias" onClick={fechar}>
                      <Inbox />
                      <span>Pendências</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            )}
            {item.para === "/faturas" && !!pendentes && (
              <SidebarMenuBadge className="rounded-full bg-warning px-1.5 text-warning-foreground">
                {pendentes}
              </SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function MenuUsuario() {
  const { usuario, papel, sair } = useAuth();
  const nome =
    (usuario?.user_metadata?.["nome"] as string | undefined) ?? usuario?.email ?? "Usuário";
  const iniciais = nome
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="h-8 w-8 rounded-md">
            <AvatarFallback className="rounded-md bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {iniciais}
            </AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{nome}</span>
            <span className="truncate text-xs opacity-70">
              {papel ? ROTULOS_PAPEL[papel] : "Sem perfil"}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {usuario?.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void sair()}>
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/dashboard">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                    <Zap className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">Controle Energia</span>
                    <span className="truncate text-xs opacity-70">Grupo Otávio Lage</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <MenuLateral />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <MenuUsuario />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <div className="flex-1">
            <BuscaGlobal />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

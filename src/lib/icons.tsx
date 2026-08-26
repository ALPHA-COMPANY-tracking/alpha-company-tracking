// Registro de ícones lucide usados nas categorias, resolvidos por nome.
import {
  Clapperboard,
  Contact,
  Ellipsis,
  Landmark,
  Megaphone,
  Package,
  RotateCcw,
  Scale,
  Server,
  Smartphone,
  Users,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const MAPA: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  wrench: Wrench,
  zap: Zap,
  contact: Contact,
  users: Users,
  clapperboard: Clapperboard,
  package: Package,
  'rotate-ccw': RotateCcw,
  landmark: Landmark,
  megaphone: Megaphone,
  scale: Scale,
  wallet: Wallet,
  server: Server,
  ellipsis: Ellipsis,
};

export function iconePorNome(nome?: string | null): LucideIcon {
  return (nome && MAPA[nome]) || Ellipsis;
}

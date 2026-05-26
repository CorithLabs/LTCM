import {
  FlaskConical, TestTube2, Microscope, Bug, Zap, Shield,
  Target, CheckSquare, Layers, GitBranch, Cpu, BookOpen,
  Clipboard, Activity, Rocket, Star, Beaker,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'

export const ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  FlaskConical,
  TestTube2,
  Beaker,
  Microscope,
  Bug,
  Zap,
  Shield,
  Target,
  CheckSquare,
  Layers,
  GitBranch,
  Cpu,
  BookOpen,
  Clipboard,
  Activity,
  Rocket,
  Star,
}

export const ICON_OPTIONS = Object.keys(ICON_MAP)

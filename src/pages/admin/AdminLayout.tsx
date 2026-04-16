import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, 
    Store, 
    Tag, 
    ListTodo, 
    Megaphone, 
    BarChart3, 
    LogOut,
    User,
    ChevronDown,
    Bell
} from 'lucide-react';

import { adminColors } from './adminStyles';

interface SidebarItemProps {
    to: string;
    icon: React.ElementType;
    label: string;
}

const SidebarItem = ({ to, icon: Icon, label }: SidebarItemProps) => (
    <NavLink
        to={to}
        style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 8,
            color: isActive ? '#fff' : '#9CA3AF',
            background: isActive ? adminColors.primary : 'transparent',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 500,
            transition: 'all 0.2s ease',
        })}
    >
        <Icon size={20} />
        <span>{label}</span>
    </NavLink>
);

const SidebarGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 24 }}>
        <h3 style={{ 
            fontSize: 11, 
            fontWeight: 700, 
            color: '#4B5563', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            padding: '0 16px',
            marginBottom: 12
        }}>
            {title}
        </h3>
        <div style={{ display: 'grid', gap: 4 }}>
            {children}
        </div>
    </div>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();

    const handleLogout = () => {
        // Simples logout para o MVP
        sessionStorage.removeItem('admin_auth');
        navigate('/admin/login');
    };

    return (
        <div style={{ 
            display: 'flex', 
            minHeight: '100vh', 
            background: adminColors.background 
        }}>
            {/* ── Sidebar ─────────────────────────────────────────── */}
            <aside style={{
                width: 260,
                background: adminColors.sidebarBg,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px 16px',
                position: 'fixed',
                height: '100vh',
                boxSizing: 'border-box'
            }}>
                <div style={{ 
                    marginBottom: 40, 
                    padding: '0 16px',
                    fontSize: 18,
                    fontWeight: 800,
                    letterSpacing: '-0.02em',
                    color: adminColors.primary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                }}>
                    <div style={{ 
                        width: 32, 
                        height: 32, 
                        background: adminColors.primary, 
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff'
                    }}>
                        <LayoutDashboard size={20} />
                    </div>
                    Economizafacil.ia.br
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <SidebarGroup title="Principal">
                        <SidebarItem to="/admin/home" icon={LayoutDashboard} label="Dashboard" />
                    </SidebarGroup>

                    <SidebarGroup title="Cadastros">
                        <SidebarItem to="/admin/markets" icon={Store} label="Mercados" />
                        <SidebarItem to="/admin/offers" icon={Tag} label="Ofertas" />
                    </SidebarGroup>

                    <SidebarGroup title="Operações">
                        <SidebarItem to="/admin/campaigns" icon={Megaphone} label="Campanhas" />
                        <SidebarItem to="/admin/queue" icon={ListTodo} label="Fila de Aprovação" />
                    </SidebarGroup>

                    <SidebarGroup title="Inteligência">
                        <SidebarItem to="/admin/analytics" icon={BarChart3} label="Análises" />
                    </SidebarGroup>
                </div>

                <div style={{ 
                    marginTop: 'auto', 
                    paddingTop: 24, 
                    borderTop: '1px solid #1F2937' 
                }}>
                    <button 
                        onClick={handleLogout}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '12px 16px',
                            width: '100%',
                            background: 'transparent',
                            border: 'none',
                            color: '#EF4444',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 500
                        }}
                    >
                        <LogOut size={20} />
                        Sair
                    </button>
                </div>
            </aside>

            {/* ── Main Content ────────────────────────────────────── */}
            <main style={{ 
                flex: 1, 
                marginLeft: 260,
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <header style={{
                    height: 64,
                    background: '#fff',
                    borderBottom: `1px solid ${adminColors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 32px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                }}>
                    <div style={{ 
                        fontSize: 14, 
                        color: adminColors.textSecondary,
                        fontWeight: 500 
                    }}>
                        Admin / <span style={{ color: adminColors.text }}>Economiza Fácil</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <button style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: adminColors.textSecondary, 
                            cursor: 'pointer' 
                        }}>
                            <Bell size={20} />
                        </button>
                        
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 12,
                            paddingLeft: 24,
                            borderLeft: `1px solid ${adminColors.border}`
                        }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>Master Admin</div>
                                <div style={{ fontSize: 11, color: adminColors.textSecondary }}>Administrador</div>
                            </div>
                            <div style={{ 
                                width: 36, 
                                height: 36, 
                                borderRadius: 10, 
                                background: '#F3F4F6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: adminColors.textSecondary
                            }}>
                                <User size={20} />
                            </div>
                            <ChevronDown size={14} color={adminColors.textSecondary} />
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div style={{ padding: 40, maxWidth: 1400, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}

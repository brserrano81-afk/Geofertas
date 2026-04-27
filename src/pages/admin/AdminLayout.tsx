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
            borderRadius: 10,
            color: isActive ? '#fff' : '#94A3B8',
            background: isActive ? adminColors.primary : 'transparent',
            textDecoration: 'none',
            fontSize: 14,
            fontWeight: 600,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative'
        })}
    >
        {({ isActive }) => (
            <>
                {isActive && (
                    <div style={{
                        position: 'absolute',
                        left: -16,
                        width: 4,
                        height: 20,
                        background: '#fff',
                        borderRadius: '0 4px 4px 0'
                    }} />
                )}
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span>{label}</span>
            </>
        )}
    </NavLink>
);

const SidebarGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 32 }}>
        <h3 style={{ 
            fontSize: 11, 
            fontWeight: 800, 
            color: '#475569', 
            textTransform: 'uppercase', 
            letterSpacing: '0.1em',
            padding: '0 16px',
            marginBottom: 16
        }}>
            {title}
        </h3>
        <div style={{ display: 'grid', gap: 6 }}>
            {children}
        </div>
    </div>
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate();

    const handleLogout = () => {
        sessionStorage.removeItem('admin_auth');
        navigate('/admin/login');
    };

    return (
        <div style={{ 
            display: 'flex', 
            minHeight: '100vh', 
            maxHeight: '100vh',
            background: adminColors.background,
            fontFamily: '"Inter", system-ui, sans-serif',
            overflow: 'hidden'
        }}>
            {/* ── Sidebar ─────────────────────────────────────────── */}
            <aside style={{
                width: 280,
                background: adminColors.sidebarBg,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                padding: '40px 16px',
                height: '100vh',
                boxSizing: 'border-box',
                zIndex: 50,
                borderRight: '1px solid #1E293B'
            }}>
                <div style={{ 
                    marginBottom: 56, 
                    padding: '0 16px',
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12
                }}>
                    <div style={{ 
                        width: 40, 
                        height: 40, 
                        background: adminColors.primary, 
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 8px 20px ${adminColors.primary}4D`
                    }}>
                        <LayoutDashboard size={22} color="#fff" strokeWidth={2.5} />
                    </div>
                    <span>Economiza Fácil</span>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
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
                    borderTop: '1px solid #1E293B' 
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
                            color: '#64748B',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                            transition: 'color 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.color = '#EF4444'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#64748B'}
                    >
                        <LogOut size={20} />
                        Sair da Conta
                    </button>
                </div>
            </aside>

            {/* ── Main Content ────────────────────────────────────── */}
            <main style={{ 
                flex: 1, 
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                overflowY: 'auto'
            }}>
                {/* Header */}
                <header style={{
                    height: 80,
                    minHeight: 80,
                    background: '#fff',
                    borderBottom: `1px solid ${adminColors.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '0 60px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 40
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                        <div style={{ position: 'relative' }}>
                            <button style={{ 
                                background: 'transparent', 
                                border: 'none', 
                                color: adminColors.textSecondary, 
                                cursor: 'pointer',
                                padding: 8,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background 0.2s'
                            }}>
                                <Bell size={22} />
                                <div style={{
                                    position: 'absolute',
                                    top: 8,
                                    right: 8,
                                    width: 8,
                                    height: 8,
                                    background: adminColors.error,
                                    borderRadius: '50%',
                                    border: '2px solid #fff'
                                }} />
                            </button>
                        </div>
                        
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 16,
                            cursor: 'pointer',
                            padding: '8px 12px',
                            borderRadius: 12,
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: adminColors.text }}>Bruno Rios</div>
                                <div style={{ fontSize: 11, color: adminColors.textSecondary, fontWeight: 700 }}>Administrador</div>
                            </div>
                            <div style={{ 
                                width: 44, 
                                height: 44, 
                                borderRadius: 14, 
                                background: adminColors.sidebarBg,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff',
                                fontWeight: 900,
                                fontSize: 15,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                            }}>
                                BR
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div style={{ padding: '60px', maxWidth: 1600, width: '100%', boxSizing: 'border-box' }}>
                    {children}
                </div>
            </main>
        </div>
    );
}

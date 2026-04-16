$path = "src/services/ChatService.ts"
$lines = Get-Content $path -Encoding UTF8
# The share_list block starts around line 698 and ends around 757
$start = 697 # line 698 (0-based)
$end = 756   # line 757 (0-based)

$cleanShareList = @'
                case 'share_list': {
                    if (pending.confirmed === null) {
                        return { text: "Você prefere ver a rota para o mercado mais barato ou compartilhar a lista no WhatsApp?" };
                    }
                    if (pending.confirmed) {
                        // Rota para o mercado — com cálculo multimodal de transporte
                        const topMarketName = pending.data?.topMarketName;
                        const dest = encodeURIComponent((topMarketName || "Supermercado"));
                        const routeLink = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

                        if (this.context.userLocation && topMarketName) {
                            try {
                                const nearbyMarkets = await geoDecisionEngine.findNearbyMarkets(
                                    this.context.userLocation.lat,
                                    this.context.userLocation.lng,
                                    50
                                );
                                const marketGeo = nearbyMarkets.find((m: any) =>
                                    m.marketName?.toLowerCase().includes(topMarketName.toLowerCase()) ||
                                    topMarketName.toLowerCase().includes(m.marketName?.toLowerCase() || '')
                                );

                                if (marketGeo?.distance) {
                                    const distKm = marketGeo.distance;
                                    const costs = calculateAllTransportCosts(
                                        distKm,
                                        this.context.consumption || 10,
                                        this.context.busTicket || 4.50
                                    );

                                    const listTotal = pending.data?.listTotal || 0;
                                    const transportLines = costs.map(c => {
                                        const costStr = c.cost > 0 ? `R$ ${c.cost.toFixed(2).replace('.', ',')}` : 'Grátis';
                                        const realTotal = listTotal > 0 ? ` → Total real: **R$ ${(listTotal + c.cost).toFixed(2).replace('.', ',')}**` : '';
                                        return `${c.emoji} **${c.label}**: ${costStr} (${c.time})${realTotal}`;
                                    });

                                    return {
                                        text: `📍 **Rota para ${topMarketName}** (${distKm.toFixed(1)} km)\n\n` +
                                            `🧮 **Custo de deslocamento (ida e volta):**\n${transportLines.join('\n')}\n\n` +
                                            `🔗 ${routeLink}\n\n` +
                                            `💡 _Economize em cada detalhe! Escolha o meio de transporte que mais cabe no seu bolso._ 💪`
                                    };
                                }
                            } catch (err) {
                                console.error('[ChatService] Transport calc error:', err);
                            }
                        }
                        // Fallback sem localização
                        return { text: `📍 **Rota para o ${topMarketName || 'mercado mais barato'}**\n\n🔗 ${routeLink}\n\n💡 _Compartilhe sua localização para eu calcular o custo de transporte (carro, ônibus, a pé, bike e uber)!_` };
                    } else {
                        // Compartilhar (WhatsApp)
                        const listItems = pending.data?.list || this.context.shoppingList;
                        if (listItems.length === 0) return { text: "Sua lista está vazia." };
                        const share = this.listManager.getShareText(listItems);
                        return { text: `Aqui está sua lista pronta para compartilhar!\n\n${share}`, shareContent: share };
                    }
                }
'@

# Split the clean block into lines and replace in the array
# We need to use [Regex]::Split to handle possible `r`n or `n
$cleanLines = [Regex]::Split($cleanShareList, "\r?\n")
$newLines = $lines[0..($start-1)] + $cleanLines + $lines[($end+1)..($lines.Count-1)]
$newLines | Set-Content $path -Encoding UTF8

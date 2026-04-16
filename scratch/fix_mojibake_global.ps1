$path = "src/services/ChatService.ts"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
$mappings = @{
    "VocÃª" = "Você"
    "rota para o mercado â€” com cÃ¡lculo multimodal" = "rota para o mercado — com cálculo multimodal"
    "Se o usuÃ¡rio tem localizaÃ§Ã£o" = "Se o usuário tem localização"
    "GrÃ¡tis" = "Grátis"
    "ðŸ“ " = "📍"
    "ðŸ§®" = "🧮"
    "ðŸ”—" = "🔗"
    "ðŸ’¡" = "💡"
    "ðŸ’ª" = "💪"
    "ðŸ›’" = "🛒"
    "âš ï¸ " = "⚠️"
    "jÃ¡" = "já"
    "estÃ¡" = "está"
    "estÃ£o" = "estão"
    "NÃ£o" = "Não"
    "localizaÃ§Ã£o" = "localização"
    "Ã´nibus" = "ônibus"
    "a pÃ©" = "a pé"
}

foreach ($key in $mappings.Keys) {
    if ($content.Contains($key)) {
        $content = $content.Replace($key, $mappings[$key])
    }
}

[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))

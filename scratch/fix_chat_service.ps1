$path = "src/services/ChatService.ts"
$lines = Get-Content $path
# Delete lines 694 to 743 (indices 693 to 742)
$newLines = $lines[0..692] + $lines[743..($lines.Count - 1)]
$newLines | Set-Content -Path $path -Encoding UTF8

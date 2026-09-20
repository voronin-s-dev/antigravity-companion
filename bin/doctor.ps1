$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "doctor.js"
& node "$script"

#!/QOpenSys/usr/bin/sh
PATH=/QOpenSys/pkgs/bin:/QOpenSys/usr/bin:$PATH
export PATH
kill -9 `ps -ef | grep meegoda1 | grep -E "start_all|server_odbc|ssh|tmole" | grep -v grep | awk '{print $2}'` 2>/dev/null

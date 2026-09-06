"""Puente TCP: 127.0.0.1:9090 (Windows) -> localhost:9090 dentro de WSL.

En vez de la red NAT de WSL (que se cae intermitentemente en este build de
Windows), tuneliza cada conexion por el transporte de pipes de wsl.exe usando
`nc` dentro de la distro. Protocolo-agnostico: HTTP y WebSocket pasan igual.
"""
import socket
import subprocess
import sys
import threading

LISTEN = ("127.0.0.1", 9090)
WSL_CMD = ["wsl.exe", "-d", "Ubuntu", "-e", "nc", "-q", "0", "127.0.0.1", "9090"]


def client_to_proc(client: socket.socket, proc: subprocess.Popen) -> None:
    try:
        while True:
            data = client.recv(65536)
            if not data:
                break
            proc.stdin.write(data)
            proc.stdin.flush()
    except OSError:
        pass
    finally:
        try:
            proc.stdin.close()
        except OSError:
            pass


def proc_to_client(client: socket.socket, proc: subprocess.Popen) -> None:
    try:
        while True:
            data = proc.stdout.read1(65536)
            if not data:
                break
            client.sendall(data)
    except OSError:
        pass
    finally:
        try:
            client.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        client.close()
        proc.kill()


def handle(client: socket.socket) -> None:
    try:
        proc = subprocess.Popen(
            WSL_CMD,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except OSError:
        client.close()
        return
    threading.Thread(target=client_to_proc, args=(client, proc), daemon=True).start()
    threading.Thread(target=proc_to_client, args=(client, proc), daemon=True).start()


def main() -> None:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN)
    srv.listen(64)
    print(f"tunneling {LISTEN} -> wsl nc 127.0.0.1 9090", flush=True)
    while True:
        client, _ = srv.accept()
        client.settimeout(None)
        threading.Thread(target=handle, args=(client,), daemon=True).start()


if __name__ == "__main__":
    sys.exit(main())

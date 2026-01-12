
import asyncio, json, time
import websockets

WS="ws://127.0.0.1:9090"
PCM="/var/www/html/EquinotesV2/out.pcm"

async def main():
    async with websockets.connect(WS, max_size=None) as ws:
        init = {
            "uid": f"test-{int(time.time())}",
            "model": "small",
            "language": "tl",
            "task": "transcribe",
            "use_vad": False
        }
        await ws.send(json.dumps(init))
        print("sent init:", init)

        with open(PCM, "rb") as f:
            data = f.read()
        print("pcm bytes:", len(data))

        chunk = 4096
        for i in range(0, len(data), chunk):
            await ws.send(data[i:i+chunk])
            await asyncio.sleep(0.01)

        await ws.send(b"END_OF_AUDIO")
        print("sent END_OF_AUDIO")

        try:
            while True:
                msg = await ws.recv()
                print("RX:", msg)
        except Exception as e:
            print("done:", e)

asyncio.run(main())

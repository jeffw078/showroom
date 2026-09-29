"""Verificação do quarto Three.js com Chrome e Playwright."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        page.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(body='', content_type='text/css'))
        page.goto(url)
        page.wait_for_function('document.querySelector("#mainImage").naturalWidth > 0')
        page.evaluate('clearTimeout(state.autoplayTimer)')
        assert page.locator('.product-card').count() == 13
        assert not any('/three/' in request or '.glb' in request for request in requests)
        assert page.locator('#systemButton').get_attribute('href') == 'https://www.pellens.com.br/sistema'
        page.locator('[data-index="1"]').click()
        page.wait_for_function('state.index === 1 && !state.animating')
        page.locator('#detailButton').click()
        page.wait_for_function('!document.querySelector("#detailImage").hidden')
        page.locator('#closeModal').click()
        page.route('**/optimized/MADRI-*.webp', lambda route: route.abort())
        page.locator('[data-index="6"]').click()
        page.wait_for_function('!state.animating && !document.querySelector("#mediaStatus").hidden')
        assert page.evaluate('state.index') == 1
        page.unroute('**/optimized/MADRI-*.webp')
        print('OK: fotos e detalhes preservados; recuperação após falha de imagem.', flush=True)

        page.route('**/bases/base_01.glb', lambda route: route.abort())
        page.locator('#modelMode').click()
        page.wait_for_function('document.querySelector("#mediaStatus").textContent.includes("Não foi possível carregar")')
        page.unroute('**/bases/base_01.glb')
        page.locator('[data-option="0"]').click()
        page.wait_for_function('state.viewer?.loaded && document.querySelector("#modelStage").getAttribute("aria-busy") === "false"')
        page.evaluate('window.initialScene = {room: state.viewer.room, light: state.viewer.lighting, camera: state.viewer.camera, renderer: state.viewer.renderer}')
        assert page.locator('.showroom-canvas').count() == 1
        assert page.locator('.component-card').count() == 3
        assert page.evaluate('state.viewer.room.children[0].receiveShadow && state.viewer.renderer.shadowMap.enabled')
        page.wait_for_timeout(300)
        page.screenshot(path=str(ROOT / 'showroom-3d-preview.png'))

        # Dissolver somente a peça trocada, sem deslocar os modelos.
        page.evaluate('''() => {
          window.beforeAnimation = {
            room: state.viewer.room,
            base: state.viewer.parts.base,
            mattress: state.viewer.parts.mattress,
            positions: Object.values(state.viewer.parts).map(part => part.position.toArray())
          };
          window.animationPromise = state.viewer.setConfiguration({...state.viewer.paths, headboard: 'assets/models/cabeceiras/cabeceira_02.glb'});
        }''')
        page.wait_for_function('state.viewer.transition?.keys.includes("headboard") && state.viewer.materials.cabeceira.opacity > 0 && state.viewer.materials.cabeceira.opacity < 1')
        assert page.evaluate('state.viewer.materials.base.opacity === 1 && state.viewer.materials.colchao.opacity === 1')
        assert page.evaluate('JSON.stringify(Object.values(state.viewer.parts).map(part => part.position.toArray())) === JSON.stringify(window.beforeAnimation.positions)')
        # Uma nova escolha durante a dissolução cancela a anterior.
        results = page.evaluate('''async () => {
          const latest = state.viewer.setConfiguration({...state.viewer.paths, headboard: 'assets/models/cabeceiras/cabeceira_03.glb'});
          return await Promise.all([window.animationPromise, latest]);
        }''')
        assert results == [False, True], results
        assert page.evaluate('state.viewer.paths.headboard.endsWith("cabeceira_03.glb") && state.viewer.bed.children.length === 3')
        assert page.evaluate('state.viewer.parts.base === window.beforeAnimation.base && state.viewer.parts.mattress === window.beforeAnimation.mattress && state.viewer.room === window.beforeAnimation.room')
        assert page.evaluate('Object.values(state.viewer.materials).every(m => m.opacity === 1 && !m.transparent && m.depthWrite)')

        # Movimento reduzido usa troca imediata, sem deixar transições pendentes.
        page.emulate_media(reduced_motion='reduce')
        page.evaluate('''async () => {
          const pending = state.viewer.setConfiguration({...state.viewer.paths, headboard: 'assets/models/cabeceiras/cabeceira_01.glb'});
          await pending;
          if (state.viewer.transition !== null) throw Error('Animação com movimento reduzido');
        }''')
        page.emulate_media(reduced_motion='no-preference')
        print('OK: transição de opacidade, cliques rápidos, encaixe e movimento reduzido.', flush=True)

        # Comparar as 27 combinações à geometria e ao encaixe anterior.
        count = page.evaluate('''async () => {
          const THREE = await import('three');
          const { composeConfiguration } = await import('./model-composer.js');
          let count = 0;
          for (let base = 1; base <= 3; base++) for (let mattress = 1; mattress <= 3; mattress++) for (let headboard = 1; headboard <= 3; headboard++) {
            const paths = {
              base: `assets/models/bases/base_0${base}.glb`,
              mattress: `assets/models/colchoes/colchao_0${mattress}.glb`,
              headboard: `assets/models/cabeceiras/cabeceira_0${headboard}.glb`
            };
            const previous = {...state.viewer.parts};
            const previousPaths = {...state.viewer.paths};
            await state.viewer.setConfiguration(paths);
            for (const key of Object.keys(paths)) if (previousPaths[key] === paths[key] && previous[key] !== state.viewer.parts[key]) throw Error('Peça intacta substituída');
            if (state.viewer.room !== window.initialScene.room || state.viewer.lighting !== window.initialScene.light || state.viewer.camera !== window.initialScene.camera || state.viewer.renderer !== window.initialScene.renderer) throw Error('Cenário recriado');
            if (state.viewer.bed.children.length !== 3 || state.viewer.scene.children.length !== 3) throw Error('Objetos duplicados');
            const old = await composeConfiguration(Object.values(paths));
            const expected = new THREE.Box3();
            for (const rootIndex of old.document.scenes[0].nodes) {
              const root = old.document.nodes[rootIndex];
              const visit = index => {
                const node = old.document.nodes[index];
                if (node.mesh !== undefined) for (const primitive of old.document.meshes[node.mesh].primitives) {
                  const accessor = old.document.accessors[primitive.attributes.POSITION];
                  expected.expandByPoint(new THREE.Vector3(...accessor.min).add(new THREE.Vector3(...root.translation)));
                  expected.expandByPoint(new THREE.Vector3(...accessor.max).add(new THREE.Vector3(...root.translation)));
                }
                (node.children || []).forEach(visit);
              };
              visit(rootIndex);
            }
            const actual = new THREE.Box3().setFromObject(state.viewer.bed);
            if (actual.min.distanceTo(expected.min) > .00001 || actual.max.distanceTo(expected.max) > .00001) throw Error('Posicionamento alterado');
            state.viewer.bed.traverse(child => {
              if (child.isMesh && (!child.castShadow || !child.receiveShadow || !child.material.isMeshStandardMaterial || child.material.metalness !== 0)) throw Error('Material ou sombra inválida');
            });
            count++;
          }
          return count;
        }''')
        assert count == 27
        print('OK: 27 combinações mantêm o posicionamento anterior; GLBs independentes, quarto e renderer únicos.', flush=True)

        # Retomar a seleção da interface, trocar cores e verificar ausência de downloads.
        page.locator('[data-option="1"]').click()
        page.wait_for_function('document.querySelector("#modelStage").getAttribute("aria-busy") === "false"')
        model_requests = len([request for request in requests if request.endswith('.glb')])
        page.locator('[data-fabric="base"][data-color="#69584c"]').click()
        page.locator('[data-fabric="headboard"][data-color="#d8d1c8"]').click()
        assert page.evaluate('state.viewer.materials.base.color.getHexString()') == '69584c'
        assert page.evaluate('state.viewer.materials.cabeceira.color.getHexString()') == 'd8d1c8'
        assert len([request for request in requests if request.endswith('.glb')]) == model_requests
        page.locator('#mattressTab').click()
        page.locator('[data-option="2"]').click()
        page.wait_for_function('document.querySelector("#modelStage").getAttribute("aria-busy") === "false"')
        assert page.evaluate('state.configuration.base === 1 && state.configuration.mattress === 2 && state.configuration.headboard === 0')
        assert page.evaluate('state.viewer.materials.base.color.getHexString()') == '69584c'
        page.locator('#baseTab').focus()
        page.keyboard.press('ArrowRight')
        assert page.locator('#mattressTab').get_attribute('aria-selected') == 'true'

        box = page.locator('.showroom-canvas').bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        before_target = page.evaluate('state.viewer.controls.target.toArray()')
        for dx, dy in [(500, 200), (-900, -200)]:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + dx, y + dy, steps=12)
            page.mouse.up()
            page.wait_for_timeout(700)
            assert page.evaluate('Math.abs(state.viewer.controls.getAzimuthalAngle()) <= .9425')
            assert page.evaluate('Math.abs(state.viewer.controls.getPolarAngle() - 1.30899694) < .001')
        page.mouse.move(x, y)
        page.mouse.down(button='right')
        page.mouse.move(x + 100, y + 80, steps=5)
        page.mouse.up(button='right')
        assert page.evaluate('state.viewer.controls.target.toArray()') == before_target
        page.mouse.move(x, y)
        page.mouse.wheel(0, -20000)
        for _ in range(15):
            page.locator('#zoomIn').click()
        page.wait_for_timeout(500)
        assert page.evaluate('state.viewer.controls.getDistance() >= state.viewer.controls.minDistance - .001')
        page.locator('#resetZoom').click()
        page.wait_for_timeout(1000)
        stable_frames = page.evaluate('state.viewer.frameCount')
        page.wait_for_timeout(1000)
        assert page.evaluate('state.viewer.frameCount') == stable_frames
        assert page.evaluate('state.viewer.renderer.info.render.triangles') < 2000
        page.screenshot(path=str(ROOT / 'showroom-3d-colors-preview.png'))

        # FOTOS pausa o renderer; voltar ao 3D mantém o quarto e as cores.
        page.locator('#photoMode').click()
        assert page.locator('.product-card').count() == 13
        assert page.locator('#fabricControls').is_hidden()
        assert page.evaluate('state.viewer.active === false')
        page.evaluate('clearTimeout(state.autoplayTimer)')
        page.screenshot(path=str(ROOT / 'showroom-preview.png'))
        page.locator('#modelMode').click()
        page.wait_for_function('document.querySelector("#modelStage").getAttribute("aria-busy") === "false"')
        assert page.evaluate('state.viewer.room === window.initialScene.room')
        assert page.evaluate('state.viewer.materials.base.color.getHexString()') == '69584c'
        print('OK: cores sem recarregar GLBs, câmera limitada e renderer em repouso sem loop contínuo.', flush=True)
        page.evaluate('setBaseColor("#a99d90"); setHeadboardColor("#82766c")')

        # Celular, tablet e orientação horizontal usam o mesmo canvas responsivo.
        for width, height, filename in [(390, 844, 'showroom-3d-mobile-preview.png'), (1024, 600, 'showroom-3d-tablet-preview.png'), (844, 390, 'showroom-3d-landscape-preview.png')]:
            page.set_viewport_size({'width': width, 'height': height})
            page.wait_for_timeout(400)
            box = page.locator('.showroom-canvas').bounding_box()
            assert box['height'] > 80 and box['width'] > 200, box
            assert page.evaluate('Math.abs(state.viewer.camera.aspect - state.viewer.container.clientWidth / state.viewer.container.clientHeight) < .01')
            assert page.locator('#fabricControls').is_visible()
            page.screenshot(path=str(ROOT / filename))
        assert not errors, errors
        print('OK: desktop, celular, tablet e landscape. Sem erros JavaScript.', flush=True)
        browser.close()
finally:
    server.shutdown()

// ===============================================================
//  STEP 7 — 위성까지: 태양계 완성 (5·11주차 종합) ★최종본★
//    · 계층(부모-자식) 변환: 위성은 '행성의 좌표계'를 물려받아 그 주위를 돈다.
//        planetFrame = rotateY(공전) · translate([R,0,0])      ← 행성 중심 좌표계(자전/크기 제외)
//        행성 몸체   = planetFrame · rotateY(자전) · scale(크기)
//        위성 몸체   = planetFrame · rotateY(위성공전) · translate([r,0,0]) · scale(위성크기)
//      → planetFrame 을 복사(mat4.clone)해 자식들에 이어 붙이는 것이 '행렬 스택'의 핵심.
//    · 궤도선(LINE_LOOP)으로 공전 경로를 그려 장면을 읽기 쉽게 한다.
//    · 마우스 드래그로 시점 회전, 휠로 줌 — 상호작용(11주차).
// ===============================================================
const { mat4 } = glMatrix;

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');


// 키보드 입력 포커스 활성화
canvas.setAttribute('tabindex', '0');
canvas.focus();


const program = makeProgram(gl, vsSource, fsSource);
gl.useProgram(program);

const uModelLoc     = gl.getUniformLocation(program, 'uModel');
const uViewLoc      = gl.getUniformLocation(program, 'uView');
const uProjLoc      = gl.getUniformLocation(program, 'uProj');
const uLightPosLoc  = gl.getUniformLocation(program, 'uLightPos');
const uModeLoc      = gl.getUniformLocation(program, 'uMode');
const uBaseColorLoc = gl.getUniformLocation(program, 'uBaseColor');

// ===== 구 메시 =====
function makeSphere(stacks = 24, slices = 32) {
    const positions = [], normals = [];
    const pt = (i, j) => {
        const phi = Math.PI * i / stacks, theta = 2 * Math.PI * j / slices;
        return [Math.sin(phi)*Math.cos(theta), Math.cos(phi), Math.sin(phi)*Math.sin(theta)];
    };
    for (let i = 0; i < stacks; i++)
        for (let j = 0; j < slices; j++) {
            const a = pt(i,j), b = pt(i+1,j), c = pt(i+1,j+1), d = pt(i,j+1);
            for (const p of [a,b,c, a,c,d]) { positions.push(...p); normals.push(...p); }
        }
    return { positions, normals, count: positions.length / 3 };
}

function makeArrayVAO(positions, normals, mode = gl.TRIANGLES) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const nrmVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: positions.length / 3, mode };
}

// XZ 평면 위 반지름 1 의 원 (궤도선용 LINE_LOOP)
function makeRing(segments = 96) {
    const positions = [], normals = [];
    for (let i = 0; i < segments; i++) {
        const a = 2 * Math.PI * i / segments;
        positions.push(Math.cos(a), 0, Math.sin(a));
        normals.push(0, 1, 0);   // mode=1
    }
    return makeArrayVAO(positions, normals, gl.LINE_LOOP);
}

const sphereMesh = makeSphere();
const sphere = makeArrayVAO(sphereMesh.positions, sphereMesh.normals);
const ring = makeRing();


// 로켓 메시 생성 함수
function makeRocket(slices = 24) {
    const positions = [], normals = [];
    const tip = [0, 0, -0.8];   // 앞코 끝점 (-Z 방향)
    const midZ = 0.5;           // 원뿔과 원통이 만나는 경계
    const endZ = 1.6;           // 원통 뒷부분 끝 (몸통 길이 조절)
    const r = 0.25;             // 공통 반지름

    for (let i = 0; i < slices; i++) {
        const a1 = 2 * Math.PI * i / slices;
        const a2 = 2 * Math.PI * (i + 1) / slices;
        const cos1 = Math.cos(a1), sin1 = Math.sin(a1);
        const cos2 = Math.cos(a2), sin2 = Math.sin(a2);

        const m1 = [cos1 * r, sin1 * r, midZ];
        const m2 = [cos2 * r, sin2 * r, midZ];
        const e1 = [cos1 * r, sin1 * r, endZ];
        const e2 = [cos2 * r, sin2 * r, endZ];

        // 1. 머리
        positions.push(...tip, ...m2, ...m1);
        normals.push(0, 0.5, -0.5,  cos2, sin2, 0,  cos1, sin1, 0);

        // 2. 몸통
        positions.push(...m1, ...m2, ...e2);
        normals.push(cos1, sin1, 0,  cos2, sin2, 0,  cos2, sin2, 0);

        positions.push(...m1, ...e2, ...e1);
        normals.push(cos1, sin1, 0,  cos2, sin2, 0,  cos1, sin1, 0);

        // 3. 뒷 뚜껑
        positions.push(0, 0, endZ, ...e1, ...e2);
        normals.push(0, 0, 1,  0, 0, 1,  0, 0, 1);
    }
    return makeArrayVAO(positions, normals, gl.TRIANGLES);
}

// const sphereMesh = makeSphere();
// const sphere = makeArrayVAO(sphereMesh.positions, sphereMesh.normals);
// const ring = makeRing();
const rocket = makeRocket(); // 로켓 VAO 생성


// ===== 장면 데이터: 행성 + (일부) 위성 =====
const PLANETS = [
    { color:[0.75,0.55,0.40], size:0.35, orbitR:2.4, orbitSpeed:0.0011, spinSpeed:0.004, moons:[] },
    { color:[0.85,0.65,0.35], size:0.55, orbitR:3.6, orbitSpeed:0.0008, spinSpeed:0.003, moons:[] },
    { color:[0.30,0.55,0.90], size:0.60, orbitR:5.0, orbitSpeed:0.0006, spinSpeed:0.004,   // 지구 + 달 1
      moons:[ { color:[0.8,0.8,0.8], size:0.16, orbitR:1.0, orbitSpeed:0.004 } ] },
    { color:[0.80,0.40,0.30], size:0.45, orbitR:6.4, orbitSpeed:0.0004, spinSpeed:0.004,   // 화성 + 달 2
      moons:[ { color:[0.7,0.6,0.5], size:0.09, orbitR:0.7, orbitSpeed:0.006 },
              { color:[0.6,0.6,0.6], size:0.07, orbitR:1.0, orbitSpeed:0.004 } ] },
    { color:[0.80,0.70,0.55], size:0.95, orbitR:8.2, orbitSpeed:0.0002, spinSpeed:0.006,   // 목성 + 달 2
      moons:[ { color:[0.85,0.8,0.7], size:0.18, orbitR:1.6, orbitSpeed:0.003 },
              { color:[0.7,0.75,0.8], size:0.15, orbitR:2.1, orbitSpeed:0.0022 } ] },
];

const proj = mat4.create();
mat4.perspective(proj, 45 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
gl.uniformMatrix4fv(uProjLoc, false, proj);

const view  = mat4.create();
const model = mat4.create();

gl.enable(gl.DEPTH_TEST);

function drawObject(obj, modelMatrix, mode, color) {
    gl.uniformMatrix4fv(uModelLoc, false, modelMatrix);
    gl.uniform1i(uModeLoc, mode);
    if (color) gl.uniform3fv(uBaseColorLoc, color);
    gl.bindVertexArray(obj.vao);
    gl.drawArrays(obj.mode, 0, obj.count);
}

// 마우스 상호작용: 드래그=시점 회전, 휠=줌 =====
let camYaw = 0.0, camPitch = 0.3, camDist = 1.0; // [수정] 3인칭 거리 
let dragging = false, lastX = 0, lastY = 0;
canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => dragging = false);

window.addEventListener('mousemove', e => {
    if (!dragging) return;
// === [수정] 마우스 오른쪽 이동 시 시점도 오른쪽으로 돌도록 부호 반전 ===
    camYaw   -= (e.clientX - lastX) * 0.01; // [세팅] 마우스 좌우 회전 감도
    camPitch += (e.clientY - lastY) * 0.01; // [세팅] 마우스 상하 회전 감도
// === [수정] 우주 공간이므로 아래쪽에서도 올려다볼 수 있게 하한선을 -87도까지 확장 ===
    camPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, camPitch)); 
    lastX = e.clientX; lastY = e.clientY;
});

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    camDist = Math.max(0.5, Math.min(40, camDist + e.deltaY * 0.006)); // === [수정] 최소 줌 거리 축소 (6 -> 1.5) ===
}, { passive: false });


// === [추가 3] 우주선 위치 상태 및 키보드 Set ===
let shipPos = [0, 1.5, 11.0]; // [세팅] 우주선 시작 위치
let shipScale = 0.2; //[세팅] 우주선 크기


const keys = new Set();
window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault(); // 스페이스바/방향키 화면 스크롤 방지
    }
    keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));


// === [추가 4] deltaTime 기반 우주선 이동 함수 ===
function updateShip(dt) {
    const moveSpeed = 3.0 * dt; // [세팅] 우주선 이동 속도

    // 카메라가 바라보는 3D 정면 벡터 (위아래 각도 camPitch 포함)
    const forward = [
        -Math.cos(camPitch) * Math.sin(camYaw),
        -Math.sin(camPitch),
        -Math.cos(camPitch) * Math.cos(camYaw)
    ];
    // 수평 오른쪽 벡터 (A, D 횡이동용)
    const right = [
        Math.cos(camYaw),
        0,
        -Math.sin(camYaw)
    ];

    if (keys.has('w')) {
        shipPos[0] += forward[0] * moveSpeed;
        shipPos[1] += forward[1] * moveSpeed; // 바라보는 상하 각도대로 고도 변화
        shipPos[2] += forward[2] * moveSpeed;
    }
    if (keys.has('s')) {
        shipPos[0] -= forward[0] * moveSpeed;
        shipPos[1] -= forward[1] * moveSpeed;
        shipPos[2] -= forward[2] * moveSpeed;
    }
    if (keys.has('d')) { shipPos[0] += right[0] * moveSpeed; shipPos[2] += right[2] * moveSpeed; }
    if (keys.has('a')) { shipPos[0] -= right[0] * moveSpeed; shipPos[2] -= right[2] * moveSpeed; }
}

function updateCamera() {
    // 1. 기존 구면좌표 오프셋 (로켓 뒤쪽 거리)
    const backX = camDist * Math.cos(camPitch) * Math.sin(camYaw);
    const backY = camDist * Math.sin(camPitch);
    const backZ = camDist * Math.cos(camPitch) * Math.cos(camYaw);

    // 2. 로켓의 로컬 위쪽(Up) 방향 벡터 계산 (pitch + 90도 방향)
    //    로켓이 위아래로 기울어져도 항상 로켓의 '등(윗면)' 쪽으로 카메라를 띄움
    const upHeight = camDist * 0.3; // [세팅] 카메라 위치(높이)
    const upX = -Math.sin(camPitch) * Math.sin(camYaw) * upHeight;
    const upY =  Math.cos(camPitch) * upHeight;
    const upZ = -Math.sin(camPitch) * Math.cos(camYaw) * upHeight;

    // 3. 카메라 위치(eye) = 로켓 위치 + 뒤쪽 오프셋 + 위쪽 오프셋
    const eye = [
        shipPos[0] + backX + upX,
        shipPos[1] + backY + upY,
        shipPos[2] + backZ + upZ,
    ];

    // 카메라 시점 (로켓 중심에서 살짝 위쪽)
    const target = [
        shipPos[0] + upX * 0.5,
        shipPos[1] + upY * 0.5,
        shipPos[2] + upZ * 0.5,
    ];

    mat4.lookAt(view, eye, target, [0, 1, 0]);
    gl.uniformMatrix4fv(uViewLoc, false, view);
}
// === [추가 4] deltaTime 기반 우주선 이동 함수 ===


const speedEl = document.getElementById('speed');
const speedVal = document.getElementById('speedVal');
let prevTime = 0; // === [추가] dt 계산용 이전 프레임 시간 ===


function render(time) {

    // === [추가 5] dt 계산 및 우주선 위치 갱신 ===
    const dt = prevTime ? (time - prevTime) * 0.001 : 0;
    prevTime = time;
    updateShip(dt);


    updateCamera();
    const speed = parseFloat(speedEl.value);
    speedVal.textContent = speed.toFixed(1) + '×';
    const t = time * speed;

    gl.uniform3fv(uLightPosLoc, [0, 0, 0]);
    gl.clearColor(0.02, 0.03, 0.06, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    // 트랙볼 중심(shipPos)에 우주선 그리기 ===
    mat4.identity(model);
    mat4.translate(model, model, shipPos);       // 우주선 위치로 이동
    mat4.rotateY(model, model, camYaw);          // 카메라가 보는 수평 방향으로 기수 회전
    mat4.rotateX(model, model, -camPitch); // 기존 -camPitch * 0.3 에서 -camPitch 로 변경
    mat4.scale(model, model, [shipScale, shipScale, shipScale]); //크기 조절
    drawObject(rocket, model, 0, [0.9, 0.92, 0.95]); // [세팅] 우주선 색상


    // ---- 태양 ----
    mat4.identity(model);
    mat4.rotateY(model, model, t * 0.0001);
    mat4.scale(model, model, [1.4, 1.4, 1.4]);
    drawObject(sphere, model, 1, [1.0, 0.75, 0.2]);

    for (const p of PLANETS) {
        // 행성 공전 궤도선 (원점 기준 반지름 orbitR)
        mat4.identity(model);
        mat4.scale(model, model, [p.orbitR, p.orbitR, p.orbitR]);
        drawObject(ring, model, 1, [0.25, 0.3, 0.4]);

        // --- 행성 중심 좌표계(자전/크기 제외) : 자식(위성)들이 물려받는다 ---
        const planetFrame = mat4.create();
        mat4.rotateY(planetFrame, planetFrame, t * p.orbitSpeed);
        mat4.translate(planetFrame, planetFrame, [p.orbitR, 0, 0]);

        // 행성 몸체 = planetFrame · 자전 · 크기
        mat4.copy(model, planetFrame);
        mat4.rotateY(model, model, t * p.spinSpeed);
        mat4.scale(model, model, [p.size, p.size, p.size]);
        drawObject(sphere, model, 0, p.color);

        // 위성들 = planetFrame 을 물려받아 그 주위를 공전
        for (const m of p.moons) {
            mat4.copy(model, planetFrame);                 // 부모(행성) 좌표계부터 시작
            mat4.rotateY(model, model, t * m.orbitSpeed);  // 위성 공전
            mat4.translate(model, model, [m.orbitR, 0, 0]);
            mat4.scale(model, model, [m.size, m.size, m.size]);
            drawObject(sphere, model, 0, m.color);
        }
    }

    requestAnimationFrame(render);
}

requestAnimationFrame(render);

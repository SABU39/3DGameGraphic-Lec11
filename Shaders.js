// ===============================================================
//  공유 셰이더 (step1 ~ step7 공통) — 텍스처 없음: 단색 + 점광원 조명
//    · 정점: 위치 + 법선 → MVP 로 변환, 월드 위치/법선을 프래그먼트로 전달
//    · 프래그먼트:
//        uMode == 0 : 램버트 확산광 (점광원 uLightPos) + 주변광  → 행성/큐브
//        uMode == 1 : 자가발광(emissive) — 조명 무시하고 uBaseColor 그대로 → 태양/마커
//  이후 단계에서 바뀌는 것은 main.js(기하·변환·애니메이션)뿐, 셰이더는 그대로다.
// ===============================================================

const vsSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;

out vec3 vWorldPos;   // 월드 공간 위치 (조명 계산용)
out vec3 vNormal;     // 월드 공간 법선

void main() {
    vec4 worldPos = uModel * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal   = mat3(uModel) * aNormal;   // 이동/회전/균일스케일일 때 유효
    gl_Position = uProj * uView * worldPos;
}`;

const fsSource = `#version 300 es
precision mediump float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 uBaseColor;  // 물체 기본 색 (텍스처 대신)
uniform vec3 uLightPos;   // 점광원 위치 (월드) — 태양계에서는 태양(원점)
uniform int  uMode;       // 0: 단색+조명, 1: 자가발광(태양/마커)

out vec4 fragColor;

void main() {
    if (uMode == 1) {                       // 자가발광: 조명 무시, 밝게
        fragColor = vec4(uBaseColor, 1.0);
        return;
    }

    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPos - vWorldPos);
    float diffuse = max(dot(N, L), 0.0);    // 램버트 확산광
    float ambient = 0.25;                   // 전역 주변광 (완전한 암흑 방지)

    vec3 color = uBaseColor * (ambient + diffuse);
    fragColor = vec4(color, 1.0);
}`;

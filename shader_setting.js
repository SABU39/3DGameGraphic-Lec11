// ===== 셰이더 도우미 (2장의 도우미 압축판) =====
function makeProgram(gl, vsSource, fsSource) {
    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            console.log(gl.getShaderInfoLog(s));
        return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        console.log(gl.getProgramInfoLog(p));
    return p;
}
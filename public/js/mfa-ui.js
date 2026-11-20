/* Việt Du Ký – giao diện đăng nhập Google, passkey, Google Authenticator (dùng chung cho khách và trang quản trị).
Dùng: var mfa = vdkMfa.create('/api/auth/mfa');  (khách)   hoặc   vdkMfa.create('/api/admin/mfa');  (quản trị) */
(function () {
  'use strict';

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') {
        e.textContent = attrs[k];
      } else if (k === 'class') {
        e.className = attrs[k];
      } else if (k.slice(0, 2) === 'on') {
        e[k] = attrs[k];
      } else {
        e.setAttribute(k, attrs[k]);
      }
    });
    [].concat(kids || []).forEach(function (c) {
      if (c != null) {
        e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    });
    return e;
  }
  function clear(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  /* ----- base64url <-> ArrayBuffer cho WebAuthn ----- */
  function toBuf(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(s + '==='.slice((s.length + 3) % 4));
    var b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      b[i] = bin.charCodeAt(i);
    }
    return b.buffer;
  }
  function toB64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) {
      s += String.fromCharCode(b[i]);
    }
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function passkeySupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }
  function describe(ex) {
    if (ex && (ex.name === 'NotAllowedError' || ex.name === 'AbortError')) {
      return 'Bạn đã huỷ hoặc đã hết thời gian chờ.';
    }
    if (ex && ex.name === 'InvalidStateError') {
      return 'Thiết bị này đã có passkey cho tài khoản.';
    }
    return (ex && ex.message) || 'Có lỗi xảy ra. Vui lòng thử lại.';
  }

  function create(base) {
    function call(method, path, body) {
      return fetch(base + path, {
        method: method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body || {})
      }).then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (d) {
          if (!res.ok) {
            var e = new Error(d.error || 'Có lỗi xảy ra. Vui lòng thử lại.');
            e.code = d.code;
            e.status = res.status;
            throw e;
          }
          return d;
        });
      }, function () {
        throw new Error('Mất kết nối mạng. Vui lòng thử lại.');
      });
    }
    var post = function (p, b) {
      return call('POST', p, b);
    };

    /* ---------- Đăng nhập Google ---------- */
    function loadGsi() {
      return new Promise(function (resolve, reject) {
        if (window.google && google.accounts && google.accounts.id) {
          return resolve();
        }
        var s = document.getElementById('gsi-client') || el('script', {
          id: 'gsi-client',
          src: 'https://accounts.google.com/gsi/client',
          async: ''
        });
        s.addEventListener('load', resolve);
        s.addEventListener('error', function () {
          reject(new Error('Không tải được Google.'));
        });
        if (!s.parentNode) {
          document.head.appendChild(s);
        }
      });
    }
    /* passkey có được dùng không: trình duyệt hỗ trợ và quản trị chưa tắt (cấu hình do máy chủ trả) */
    var cfgP = null;
    function passkeyOn() {
      cfgP = cfgP || call('GET', '/config').catch(function () {
        return {};
      });
      return cfgP.then(function (c) {
        return c.passkey !== false && passkeySupported();
      });
    }
    function googleButton(box, onDone, onError, path) {
      return call('GET', '/config').then(function (cfg) {
        if (!cfg.google_client_id) {
          return false;
        }
        return loadGsi().then(function () {
          google.accounts.id.initialize({
            client_id: cfg.google_client_id,
            nonce: cfg.nonce,
            ux_mode: 'popup',
            auto_select: false,
            callback: function (r) {
              post(path || '/google', { credential: r.credential, nonce: cfg.nonce }).then(onDone, function (ex) {
                onError(ex.message);
              });
            }
          });
          clear(box);
          google.accounts.id.renderButton(box, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'pill',
            logo_alignment: 'left',
            locale: 'vi',
            width: Math.max(200, Math.min(380, box.clientWidth || 320))
          });
          return true;
        });
      }).catch(function () {
        return false; // không có Google thì vẫn đăng nhập bằng mật khẩu được
      });
    }

    /* ---------- Passkey ---------- */
    function passkeyLogin(ticket) {
      return post('/passkey/options', ticket ? { ticket: ticket } : {}).then(function (o) {
        var pk = o.publicKey;
        pk.challenge = toBuf(pk.challenge);
        (pk.allowCredentials || []).forEach(function (c) {
          c.id = toBuf(c.id);
        });
        return navigator.credentials.get({ publicKey: pk }).then(function (cred) {
          var r = cred.response;
          return post('/passkey/verify', {
            ticket: ticket || undefined,
            challengeId: o.challengeId,
            credential: {
              rawId: toB64(cred.rawId),
              response: {
                authenticatorData: toB64(r.authenticatorData),
                clientDataJSON: toB64(r.clientDataJSON),
                signature: toB64(r.signature)
              }
            }
          });
        });
      });
    }
    function passkeyAdd(name) {
      return post('/passkey/reg-options', {}).then(function (o) {
        var pk = o.publicKey;
        pk.challenge = toBuf(pk.challenge);
        pk.user.id = toBuf(pk.user.id);
        (pk.excludeCredentials || []).forEach(function (c) {
          c.id = toBuf(c.id);
        });
        return navigator.credentials.create({ publicKey: pk }).then(function (cred) {
          var r = cred.response;
          return post('/passkey/register', {
            challengeId: o.challengeId,
            name: name,
            credential: {
              rawId: toB64(cred.rawId),
              response: {
                clientDataJSON: toB64(r.clientDataJSON),
                attestationObject: toB64(r.attestationObject),
                transports: r.getTransports ? r.getTransports() : []
              }
            }
          });
        });
      });
    }

    /* ---------- Bước hai sau khi nhập đúng mật khẩu ---------- */
    function challengeUI(box, data, onDone, onBack) {
      clear(box);
      var msg = el('p', {
        class: 'mfa-msg',
        role: 'alert',
        hidden: ''
      });
      function fail(t) {
        msg.textContent = t;
        msg.hidden = false;
      }
      var wrap = el('div', { class: 'mfa-step' }, [
        el('h2', { text: 'Xác thực hai lớp' }),
        el('p', { class: 'mfa-sub', text: 'Tài khoản này đã bật bảo mật thêm một lớp.' })
      ]);
      if (data.methods.indexOf('totp') >= 0) {
        var input = el('input', {
          class: 'mfa-input',
          type: 'text',
          inputmode: 'text',
          autocomplete: 'one-time-code',
          maxlength: '12',
          placeholder: 'Mã 6 số hoặc mã khôi phục',
          'aria-label': 'Mã xác thực'
        });
        var go = el('button', {
          class: 'mfa-btn primary',
          type: 'submit',
          text: 'Xác nhận'
        });
        var form = el('form', { class: 'mfa-form' }, [
          el('label', { class: 'mfa-lbl', text: 'Mở Google Authenticator và nhập mã 6 số' }), input, go
        ]);
        form.onsubmit = function (e) {
          e.preventDefault();
          msg.hidden = true;
          go.disabled = true;
          post('/verify', { ticket: data.ticket, code: input.value }).then(onDone, function (ex) {
            fail(ex.message);
            go.disabled = false;
            input.select();
          });
        };
        wrap.appendChild(form);
        setTimeout(function () {
          input.focus();
        }, 50);
      }
      if (data.methods.indexOf('passkey') >= 0 && passkeySupported()) {
        var pb = el('button', {
          class: 'mfa-btn' + (data.methods.indexOf('totp') >= 0 ? '' : ' primary'),
          type: 'button',
          text: 'Dùng passkey'
        });
        pb.onclick = function () {
          msg.hidden = true;
          pb.disabled = true;
          passkeyLogin(data.ticket).then(onDone, function (ex) {
            fail(describe(ex));
            pb.disabled = false;
          });
        };
        wrap.appendChild(pb);
      }
      wrap.appendChild(msg);
      if (onBack) {
        wrap.appendChild(el('button', {
          class: 'mfa-link',
          type: 'button',
          text: 'Quay lại',
          onclick: onBack
        }));
      }
      box.appendChild(wrap);
    }

    /* ---------- Cài đặt bảo mật của chính mình ---------- */
    function settingsUI(box) {
      var state = null;
      function render() {
        clear(box);
        box.appendChild(el('p', { class: 'mfa-sub', text: 'Đang tải…' }));
        call('GET', '/security').then(function (s) {
          state = s;
          draw();
        }, function (ex) {
          clear(box);
          box.appendChild(el('p', { class: 'mfa-msg', text: ex.message }));
        });
      }
      function note(parent, text, bad) {
        var p = parent.querySelector('.mfa-note') || parent.appendChild(el('p', { class: 'mfa-note' }));
        p.textContent = text;
        p.className = 'mfa-note' + (bad ? ' bad' : '');
        return p;
      }

      /* Ô nhập lại mật khẩu / mã trước thao tác nhạy cảm */
      function reauth(parent, label, run) {
        var old = parent.querySelector('.mfa-reauth');
        if (old) {
          old.remove();
        }
        var needPw = state.has_password, field = el('input', {
          class: 'mfa-input',
          type: needPw ? 'password' : 'text',
          autocomplete: needPw ? 'current-password' : 'one-time-code',
          placeholder: needPw ? 'Nhập lại mật khẩu' : 'Mã 6 số hoặc mã khôi phục',
          'aria-label': 'Xác nhận'
        });
        var form = el('form', { class: 'mfa-reauth mfa-form' }, [field, el('button', {
            class: 'mfa-btn primary',
            type: 'submit',
            text: label
          })]);
        form.onsubmit = function (e) {
          e.preventDefault();
          var b = {};
          b[needPw ? 'password' : 'code'] = field.value;
          run(b, form);
        };
        parent.appendChild(form);
        field.focus();
      }

      function showCodes(parent, codes) {
        var pre = el('pre', { class: 'mfa-codes', text: codes.join('\n') });
        var box2 = el('div', { class: 'mfa-codebox' }, [
          el('strong', { text: 'Lưu mã khôi phục' }),
          el('p', { class: 'mfa-sub', text: 'Mỗi mã dùng được một lần khi mất điện thoại. Chúng chỉ hiện lúc này.' }), pre,
          el('div', { class: 'mfa-row' }, [
            el('button', {
              class: 'mfa-btn',
              type: 'button',
              text: 'Sao chép',
              onclick: function () {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(codes.join('\n'));
                }
              }
            }),
            el('button', {
              class: 'mfa-btn',
              type: 'button',
              text: 'Tải về',
              onclick: function () {
                var a = el('a', { href: URL.createObjectURL(new Blob([codes.join('\n') + '\n'], { type: 'text/plain' })), download: 'ma-khoi-phuc-viet-du-ky.txt' });
                document.body.appendChild(a);
                a.click();
                a.remove();
              }
            }),
            el('button', {
              class: 'mfa-btn primary',
              type: 'button',
              text: 'Tôi đã lưu',
              onclick: render
            })
          ])
        ]);
        clear(parent);
        parent.appendChild(box2);
      }

      function totpSection() {
        var sec = el('section', { class: 'mfa-sec' }, [
          el('h3', { text: 'Google Authenticator' }),
          el('p', { class: 'mfa-sub', text: state.totp ? 'Đang bật. Mỗi lần đăng nhập bằng mật khẩu sẽ cần thêm mã 6 số.' : 'Dùng ứng dụng Google Authenticator (hoặc Authy, 1Password…) để tạo mã 6 số khi đăng nhập.' })
        ]);
        var area = el('div', { class: 'mfa-area' });
        if (!state.totp) {
          area.appendChild(el('button', {
            class: 'mfa-btn primary',
            type: 'button',
            text: 'Thiết lập',
            onclick: function () {
              post('/totp/setup').then(function (r) {
                clear(area);
                var qr = el('div', { class: 'mfa-qr' });
                try {
                  qr.appendChild(window.vdkQR.svg(r.uri, 176));
                } catch (e) { /* URI quá dài: dùng khoá nhập tay bên dưới */
                }
                var code = el('input', {
                  class: 'mfa-input',
                  type: 'text',
                  inputmode: 'numeric',
                  autocomplete: 'one-time-code',
                  maxlength: '7',
                  placeholder: 'Mã 6 số',
                  'aria-label': 'Mã 6 số'
                });
                var f = el('form', { class: 'mfa-form' }, [code, el('button', {
                    class: 'mfa-btn primary',
                    type: 'submit',
                    text: 'Bật'
                  })]);
                f.onsubmit = function (e) {
                  e.preventDefault();
                  post('/totp/enable', { code: code.value }).then(function (d) {
                    showCodes(area, d.recovery || []);
                  }, function (ex) {
                    note(area, ex.message, true);
                  });
                };
                area.appendChild(el('ol', { class: 'mfa-steps' }, [
                  el('li', { text: 'Mở Google Authenticator, chọn “+” rồi quét mã QR (hoặc nhập khoá bên dưới).' }),
                  el('li', { text: 'Nhập mã 6 số ứng dụng đang hiện để bật.' })
                ]));
                area.appendChild(qr);
                area.appendChild(el('p', { class: 'mfa-key' }, ['Khoá nhập tay: ', el('code', { text: r.secret.replace(/(.{4})/g, '$1 ').trim() })]));
                area.appendChild(f);
              }, function (ex) {
                note(area, ex.message, true);
              });
            }
          }));
        } else {
          var row = el('div', { class: 'mfa-row' });
          row.appendChild(el('button', {
            class: 'mfa-btn',
            type: 'button',
            text: 'Tạo lại mã khôi phục (' + state.recovery_left + ' mã còn lại)',
            onclick: function () {
              reauth(area, 'Tạo mã mới', function (b, form) {
                post('/recovery/regen', b).then(function (d) {
                  showCodes(area, d.recovery || []);
                }, function (ex) {
                  note(form, ex.message, true);
                });
              });
            }
          }));
          row.appendChild(el('button', {
            class: 'mfa-btn danger',
            type: 'button',
            text: 'Tắt',
            onclick: function () {
              reauth(area, 'Xác nhận tắt', function (b, form) {
                post('/totp/disable', b).then(render, function (ex) {
                  note(form, ex.message, true);
                });
              });
            }
          }));
          area.appendChild(row);
        }
        sec.appendChild(area);
        return sec;
      }

      function passkeySection() {
        var sec = el('section', { class: 'mfa-sec' }, [
          el('h3', { text: 'Passkey' }),
          el('p', { class: 'mfa-sub', text: 'Đăng nhập bằng vân tay, khuôn mặt hoặc khoá màn hình của thiết bị, không cần mật khẩu.' })
        ]);
        var area = el('div', { class: 'mfa-area' });
        if (state.passkeys.length) {
          var ul = el('ul', { class: 'mfa-list' });
          state.passkeys.forEach(function (k) {
            var when = k.last_used ? 'dùng lần cuối ' + new Date(k.last_used).toLocaleDateString('vi-VN') : 'thêm ngày ' +
              new Date(k.created_at).toLocaleDateString('vi-VN');
            ul.appendChild(el('li', null, [
              el('span', null, [el('b', { text: k.name || 'Passkey' }), el('small', { text: when })]),
              el('button', {
                class: 'mfa-btn danger sm',
                type: 'button',
                text: 'Xoá',
                onclick: function () {
                  reauth(area, 'Xác nhận xoá', function (b, form) {
                    b.id = k.id;
                    post('/passkey/delete', b).then(render, function (ex) {
                      note(form, ex.message, true);
                    });
                  });
                }
              })
            ]));
          });
          area.appendChild(ul);
        }
        if (passkeySupported()) {
          var name = el('input', {
            class: 'mfa-input',
            type: 'text',
            maxlength: '40',
            placeholder: 'Tên gợi nhớ (vd: Laptop, iPhone)',
            'aria-label': 'Tên passkey'
          });
          var add = el('button', {
            class: 'mfa-btn primary',
            type: 'submit',
            text: 'Thêm passkey'
          });
          var f = el('form', { class: 'mfa-form' }, [name, add]);
          f.onsubmit = function (e) {
            e.preventDefault();
            add.disabled = true;
            passkeyAdd(name.value).then(function (d) {
              if (d.recovery) {
                clear(area);
                showCodes(area, d.recovery);
              } else {
                render();
              }
            }, function (ex) {
              note(area, describe(ex), true);
              add.disabled = false;
            });
          };
          area.appendChild(f);
        } else {
          area.appendChild(el('p', { class: 'mfa-sub', text: 'Trình duyệt này chưa hỗ trợ passkey.' }));
        }
        sec.appendChild(area);
        return sec;
      }

      function googleSection() {
        var sec = el('section', { class: 'mfa-sec' }, [el('h3', { text: 'Liên kết Google' })]);
        var area = el('div', { class: 'mfa-area' });
        if (state.google) {
          sec.appendChild(el('p', { class: 'mfa-sub', text: 'Đã liên kết' +
              (state.google_email ? ' với ' +
                state.google_email : '') +
              '. Bạn có thể đăng nhập bằng nút “Tiếp tục với Google” hoặc bằng email và mật khẩu.' }));
          if (!state.has_password) {
            area.appendChild(el('p', { class: 'mfa-sub', text: 'Hãy đặt mật khẩu (mục “Đặt mật khẩu” phía trên) để có thể gỡ liên kết và dùng tính năng cần mật khẩu.' }));
          } else {
            area.appendChild(el('button', {
              class: 'mfa-btn danger',
              type: 'button',
              text: 'Gỡ liên kết Google',
              onclick: function () {
                reauth(area, 'Xác nhận gỡ', function (b, form) {
                  post('/google/unlink', b).then(render, function (ex) {
                    note(form, ex.message, true);
                  });
                });
              }
            }));
          }
        } else if (state.google_enabled) {
          sec.appendChild(el('p', { class: 'mfa-sub', text: 'Liên kết để lần sau đăng nhập nhanh bằng Google. Bạn vẫn giữ email và mật khẩu để lấy lại tài khoản khi cần.' }));
          var gbox = el('div', { class: 'mfa-google' });
          area.appendChild(gbox);
          googleButton(gbox, render, function (t) {
            note(area, t, true);
          }, '/google/link').then(function (ok) {
            if (!ok) {
              gbox.remove();
            }
          });
        } else {
          sec.appendChild(el('p', { class: 'mfa-sub', text: 'Chưa được bật trên website này.' }));
        }
        sec.appendChild(area);
        return sec;
      }

      function draw() {
        clear(box);
        box.appendChild(totpSection());
        if (state.passkey_enabled !== false) { // quản trị đã tắt passkey: ẩn cả phần thêm / xoá
          box.appendChild(passkeySection());
        }
        box.appendChild(googleSection());
      }
      render();
    }

    return {
      call: call,
      post: post,
      googleButton: googleButton,
      passkeyLogin: passkeyLogin,
      passkeyOn: passkeyOn,
      challengeUI: challengeUI,
      settingsUI: settingsUI,
      passkeySupported: passkeySupported,
      describe: describe
    };
  }

  window.vdkMfa = { create: create };
})();

(() => {
  if (window.PegglePrime) {
    window.PegglePrime.stop();
  }

  const DEG_TO_RAD = Math.PI / 180;

  // angle is measured from -y axis
  const movePoint = (point, angle, magnitude) => {
    const xOff = magnitude * Math.sin(angle * DEG_TO_RAD);
    const yOff = magnitude * Math.cos(angle * DEG_TO_RAD);
    return {
      x: point.x + (Math.abs(xOff) < 0.0001 ? 0 : xOff),
      y: point.y - (Math.abs(yOff) < 0.0001 ? 0 : yOff)
    };
  };

  function dot(v1, v2) {
    return v1.x * v2.x + v1.y * v2.y;
  }

  function unit(v) {
    const mag = Math.sqrt(v.x * v.x + v.y * v.y);
    return {
      x: v.x / mag,
      y: v.y / mag
    };
  }

  const DEFAULT_STATE = {
    lastTick: undefined,
    cannon: {
      origin: {
        x: 0,
        y: 0 // determined in autoAdjust
      },
      length: 50,
      angle: 0,
      muzzleVelocity: 750,
      canMove: true
    },
    player: {
      effects: [],
      balls: 10
    },
    board: {
      width: 660,
      height: 680,
      ballRadius: 10,
      pieceRadius: 14,
      gravity: -900,
      balls: [],
      configuration: {
        pieceValues: {
          GOAL: 100,
          BONUS: 1000,
          POINT: 25,
          POWER: 100
        }
      },
      pieces: [
        {
          type: "GOAL",
          isVisible: true,
          isHit: false,
          position: {
            x: -100,
            y: 0
          }
        },
        {
          type: "POINT",
          isVisible: true,
          isHit: false,
          position: {
            x: -50,
            y: -50
          }
        },
        {
          type: "BONUS",
          isVisible: true,
          isHit: false,
          position: {
            x: 100,
            y: 0
          }
        },
        {
          type: "POWER",
          isVisible: true,
          isHit: false,
          position: {
            x: 50,
            y: -50
          }
        }
      ]
    }
  };

  const DEFAULT_ENGINE = {
    playerActions: [
      {
        action: "AIM",
        description: "Adjust the direction the ball is launched",
        defaultMapping: "MOUSE_MOVE"
      },
      {
        action: "SHOOT",
        description: "Launch the ball from the cannon",
        defaultMapping: "MOUSE_LCLICK"
      },
      {
        action: "TOGGLE_AIM",
        description: "Toggle aiming movement",
        defaultMapping: "MOUSE_RCLICK"
      }
    ],
    apply(state, action) {
      const { name, payload } = action;
      switch (name) {
        case "AIM": {
          const { canMove, origin } = state.cannon;

          if (!canMove) {
            return state;
          }

          const x = origin.x - payload.x;
          const y = origin.y - Math.min(origin.y, payload.y);
          return {
            ...state,
            cannon: {
              ...state.cannon,
              angle: Math.atan2(y, x) / DEG_TO_RAD - 90
            }
          };
        }
        case "SHOOT": {
          if (!state.player.balls || state.board.balls.length) {
            return state;
          }

          const { origin, angle, length, muzzleVelocity } = state.cannon;
          const ball = {
            position: {
              ...movePoint(origin, angle, length)
            },
            velocity: {
              ...movePoint({ x: 0, y: 0 }, angle, muzzleVelocity)
            }
          };
          return {
            ...state,
            player: {
              ...state.player
              //                            balls: state.player.balls - 1
            },
            board: {
              ...state.board,
              balls: [...state.board.balls, ball]
            }
          };
        }
        case "TOGGLE_AIM": {
          const { canMove } = state.cannon;
          return {
            ...state,
            cannon: {
              ...state.cannon,
              canMove: !canMove
            }
          };
        }
        case "TICK": {
          const { gravity, height, width, ballRadius, pieces } = state.board;
          const { delta } = payload;
          const bounds = {
            bottom: -height / 2,
            left: -width / 2,
            right: width / 2
          };
          const hitIds = new Set();
          const balls = state.board.balls
            .map(ball => {
              const updated = {
                ...ball,
                position: {
                  x: ball.position.x + ball.velocity.x * delta,
                  y:
                    ball.position.y +
                    ball.velocity.y * delta +
                    gravity * 0.5 * delta * delta
                },
                velocity: {
                  ...ball.velocity,
                  y: ball.velocity.y + gravity * delta
                }
              };

              // wall collision
              if (updated.position.x - ballRadius < bounds.left) {
                const diff = bounds.left - (updated.position.x - ballRadius);
                updated.position.x = bounds.left + diff;
                updated.velocity.x = -updated.velocity.x;
              } else if (updated.position.x + ballRadius > bounds.right) {
                const diff = updated.position.x + ballRadius - bounds.right;
                updated.position.x = bounds.right - diff;
                updated.velocity.x = -updated.velocity.x;
              }

              // piece collision
              let i = -1;
              for (let piece of pieces) {
                i++;

                if (!piece.isVisible) {
                  continue;
                }

                const collision = this.collision(state, updated, piece, ball);
                if (collision) {
                  hitIds.add(i);
                  updated.position = collision.position;
                  updated.velocity = collision.velocity;
                }
              }

              return updated;
            })
            .filter(ball => {
              // out of bounds
              if (ball.position.y + ballRadius < bounds.bottom) {
                return false;
              }
              return true;
            });

          return {
            ...state,
            board: {
              ...state.board,
              balls,
              pieces: hitIds.size
                ? state.board.pieces.map((piece, i) => {
                    if (hitIds.has(i)) {
                      return {
                        ...piece,
                        isHit: true
                      };
                    }

                    return piece;
                  })
                : state.board.pieces
            }
          };
        }
        default: {
          console.log("Unknown action", { name, payload });
          return state;
        }
      }
    },
    collision(state, ball, piece, oBall, delta) {
      const { ballRadius, pieceRadius, gravity } = state.board;
      const r = ballRadius + pieceRadius;
      const dx = ball.position.x - piece.position.x;
      const dy = ball.position.y - piece.position.y;
      if (dx * dx + dy * dy > r * r) {
        return null;
      }

      const uv = unit({
        x: (dx * ballRadius) / r - piece.position.x,
        y: (dy * ballRadius) / r - piece.position.y
      });

      return {
        position: {
          x: ball.position.x + uv.x * pieceRadius,
          y: ball.position.y + uv.y * pieceRadius
        },
        velocity: {
          x: (ball.velocity.x - 2 * uv.x * dot(ball.velocity, uv)) * 0.9,
          y: (ball.velocity.y - 2 * uv.y * dot(ball.velocity, uv)) * 0.9
        }
      };
    }
  };

  const DEFAULT_RENDERER = {
    running: false,
    lastState: {},
    init(initialState, engine) {
      const root = window.document.body;
      root.classList.toggle("game-window", true);
      root.innerHTML = "";

      this.state = initialState;
      this.autoAdjust();
      this.renderStyle();
      this.actionQueue = [];

      const game = {
        stop: () => this.stop(),
        getState: () => this.state,
        dispatch: action => this.dispatch(action),
        engine,
        renderer: this
      };

      const loop = () => {
        if (!this.running) {
          return;
        }

        this.lastState = this.state;

        while (this.actionQueue.length) {
          this.state = engine.apply(this.state, this.actionQueue.pop());
        }

        this.gameLoop = window.requestAnimationFrame(clock => {
          this.state = engine.apply(this.state, {
            name: "TICK",
            payload: {
              delta: (clock - (this.lastTick || clock)) / 1000
            }
          });
          this.lastTick = clock;
          this.render(root);
          loop();
        });
      };

      this.running = true;
      loop();

      return game;
    },
    dispatch(action) {
      this.actionQueue.push(action);
    },
    stop() {
      this.running = false;
    },
    worldToBrowser(point) {
      const { width, height } = this.state.board;
      return {
        x: width / 2 + point.x,
        y: height / 2 - point.y
      };
    },
    browserToWorld(point) {
      const { width, height } = this.state.board;
      return {
        x: point.x - width / 2,
        y: height / 2 - point.y
      };
    },
    autoAdjust() {
      const { innerWidth, innerHeight } = window;
      const width = innerWidth - 40;
      const height = innerHeight - 40;

      this.state = {
        ...this.state,
        board: {
          ...this.state.board,
          width,
          height
        },
        cannon: {
          ...this.state.cannon,
          origin: {
            ...this.state.cannon.origin,
            y: height / 2 - 5
          }
        }
      };
    },
    renderStyle() {
      const { state } = this;
      const styleEl =
        document.getElementById("pp-style") || document.createElement("style");
      styleEl.id = "pp-style";
      styleEl.innerHTML = `
html,
.game-window {
  box-sizing: border-box;
  height: 100%;
  width: 100%;
  margin: 0;
  background: aliceblue;
  position: relative;
  overflow: hidden;
}

.board {
  position: relative;
  width: ${state.board.width}px;
  height: ${state.board.height}px;
  margin: 20px;
  background: lightcoral;
  overflow: hidden;
  border-radius: 10px;
}

.score {
  position: absolute;
  display: inline-block;
  right: 20px;
  top: 5px;
  color: white;
  font-family: 'Helvetica Neue', Helvetica;
  font-weight: bold;
  font-size: 24pt;
}

.cannon {
  position: relative;
  background: purple;
  height: ${state.board.ballRadius * 8}px;
  width: ${state.board.ballRadius * 8}px;
  margin-top: ${-state.board.ballRadius * 4}px;
  margin-left: ${-state.board.ballRadius * 4}px;
  border-radius: 50%;
}

.cannon__barrel {
  position: absolute;
  background: black;
  width: ${state.board.ballRadius * 2}px;
  height: ${state.cannon.length}px;
  top: 50%;
  left: calc(50% - ${state.board.ballRadius}px);
  border-radius: ${state.board.ballRadius}px;
}

.ball {
  position: absolute;
  box-sizing: border-box;
  width: ${state.board.ballRadius * 2}px;
  height: ${state.board.ballRadius * 2}px;
  margin-left: ${-state.board.ballRadius}px;
  margin-top: ${-state.board.ballRadius}px;
  border-radius: 50%;
  background: grey;
}

.piece {
  position: absolute;
  box-sizing: border-box;
  width: ${state.board.pieceRadius * 2}px;
  height: ${state.board.pieceRadius * 2}px;
  margin-left: ${-state.board.pieceRadius}px;
  margin-top: ${-state.board.pieceRadius}px;
  border-radius: 50%;
  border: ${(state.board.pieceRadius * 0.2).toFixed(0)}px solid transparent;
}

.piece--point {
  background-color: aqua;
  border-color: turquoise;
}

.piece--goal {
  background-color: darkorange;
  border-color: orange;
}

.piece--bonus {
  background-color: blueviolet;
  border-color: purple;
}

.piece--power {
  background-color: limegreen;
  border-color: green;
}

.piece--is-hit {
  box-shadow: lightblue 0 0 5px 3px;
}
          `.trim();
      document.head.appendChild(styleEl);
    },
    render(root) {
      this.renderBoard(root);
    },
    renderBoard(root) {
      let board = root.querySelector(".board");
      if (!board) {
        board = document.createElement("div");
        board.classList.add("board");

        board.addEventListener("mousemove", ev => {
          const { x, y } = board.getBoundingClientRect();
          this.actionQueue.push({
            name: "AIM",
            payload: this.browserToWorld({
              x: ev.clientX - x,
              y: ev.clientY - y
            })
          });
        });
        board.addEventListener(
          "click",
          ev => {
            this.dispatch({
              name: "SHOOT"
            });
          },
          true
        );
        root.addEventListener("keypress", ev => {
          ev.preventDefault();
          if (ev.key === "a") {
            this.dispatch({
              name: "TOGGLE_AIM"
            });
          }
        });
        root.appendChild(board);
      }

      this.renderScore(board);
      this.renderPieces(board);
      this.renderCannon(board);
      this.renderBalls(board);
    },
    renderPieces(root) {
      const pieces = this.state.board.pieces;

      let pieceEls = Array.from(root.querySelectorAll(".piece"));
      if (!pieceEls.length) {
        pieceEls = pieces.map((piece, i) => {
          const el = document.createElement("div");
          el.id = `piece-${i}`;
          el.classList.add("piece");
          el.classList.add(`piece--${piece.type.toLowerCase()}`);
          root.appendChild(el);
          return el;
        });
      }

      for (let i = 0, off = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        const pieceEl = pieceEls[i - off];
        const idMatch = pieceEl.id === `piece-${i}`;

        if (!piece.isVisible && idMatch) {
          pieceEl.remove();
          continue;
        } else if (!idMatch) {
          off++;
          i--;
          continue;
        }

        pieceEl.classList.toggle("piece--is-hit", piece.isHit);

        const position = this.worldToBrowser(piece.position);
        pieceEl.style.left = `${position.x}px`;
        pieceEl.style.top = `${position.y}px`;
      }
    },
    renderCannon(root) {
      let cannon = root.querySelector(".cannon");
      if (!cannon) {
        cannon = document.createElement("div");
        cannon.classList.add("cannon");

        const position = this.worldToBrowser(this.state.cannon.origin);
        cannon.style.left = `${position.x}px`;
        cannon.style.top = `${position.y}px`;

        const barrel = document.createElement("div");
        barrel.classList.add("cannon__barrel");
        cannon.appendChild(barrel);
        root.appendChild(cannon);
      }

      const rot = (-this.state.cannon.angle).toFixed(2);
      cannon.style.transform = `rotate(${rot}deg)`;
    },
    renderBalls(root) {
      let { balls } = this.state.board;
      const ballEls = Array.from(root.querySelectorAll(".ball"));

      // ball on cannon
      if (!balls.length && this.state.player.balls > 0) {
        const { length, angle, origin } = this.state.cannon;
        balls = [
          {
            position: {
              ...movePoint(origin, angle, length)
            }
          }
        ];
      }

      const len = Math.max(ballEls.length, balls.length);

      for (let i = 0; i < len; i++) {
        if (i >= balls.length) {
          ballEls[i].remove();
          continue;
        }

        const ballEl =
          ballEls[i] ||
          (() => {
            const el = document.createElement("div");
            el.classList.add("ball");
            root.appendChild(el);
            return el;
          })();

        const position = this.worldToBrowser(balls[i].position);
        ballEl.style.left = `${position.x}px`;
        ballEl.style.top = `${position.y}px`;
      }
    },
    renderScore(root) {
      let scoreEl = root.querySelector(".score");
      if (!scoreEl) {
        scoreEl = document.createElement("span");
        scoreEl.classList.add("score");
        root.appendChild(scoreEl);
      }

      const { configuration, pieces } = this.state.board;
      if (!scoreEl.innerHTML || pieces !== this.lastState.board.pieces) {
        const score = pieces.reduce((total, piece) => {
          if (piece.isHit) {
            return total + configuration.pieceValues[piece.type];
          }
          return total;
        }, 0);

        scoreEl.innerHTML = score;
      }
    }
  };

  window.PegglePrime = (({
    /**
     * The game state (resources, score, board)
     */
    state = DEFAULT_STATE,

    /**
     * playerActions: List({ action, description, defaultMapping })
     * apply(state, action) => state
     */
    engine = DEFAULT_ENGINE,

    /**
     * init(state, engine) => Game
     */
    renderer = DEFAULT_RENDERER
  } = {}) => {
    return renderer.init(state, engine);
  })();

  console.log(window.PegglePrime);
})();

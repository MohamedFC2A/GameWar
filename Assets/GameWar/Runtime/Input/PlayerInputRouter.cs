using UnityEngine;

namespace GameWar
{
    public class PlayerInputRouter : MonoBehaviour
    {
        [SerializeField]
        private float joystickRadius = 140f;

        private int moveFingerId = -1;
        private int fireFingerId = -1;
        private Vector2 moveStartPosition;
        private Vector2 moveAxis;
        private bool fireHeld;

        public Vector2 MoveAxis
        {
            get { return moveAxis; }
        }

        public bool FireHeld
        {
            get { return fireHeld; }
        }

        private void Update()
        {
            if (Input.touchCount > 0)
            {
                UpdateTouchInput();
            }
            else
            {
                UpdateDesktopFallback();
            }
        }

        private void UpdateTouchInput()
        {
            moveAxis = Vector2.zero;
            fireHeld = false;

            for (int i = 0; i < Input.touchCount; i++)
            {
                Touch touch = Input.GetTouch(i);
                bool isLeftSide = touch.position.x < Screen.width * 0.5f;

                if (touch.phase == TouchPhase.Began)
                {
                    if (isLeftSide && moveFingerId == -1)
                    {
                        moveFingerId = touch.fingerId;
                        moveStartPosition = touch.position;
                    }
                    else if (!isLeftSide && fireFingerId == -1)
                    {
                        fireFingerId = touch.fingerId;
                        fireHeld = true;
                    }
                }

                if (touch.fingerId == moveFingerId)
                {
                    if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    {
                        moveFingerId = -1;
                        moveAxis = Vector2.zero;
                    }
                    else
                    {
                        Vector2 delta = touch.position - moveStartPosition;
                        moveAxis = Vector2.ClampMagnitude(delta / joystickRadius, 1f);
                    }
                }

                if (touch.fingerId == fireFingerId)
                {
                    if (touch.phase == TouchPhase.Ended || touch.phase == TouchPhase.Canceled)
                    {
                        fireFingerId = -1;
                        fireHeld = false;
                    }
                    else
                    {
                        fireHeld = true;
                    }
                }
            }
        }

        private void UpdateDesktopFallback()
        {
            moveAxis = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            moveAxis = Vector2.ClampMagnitude(moveAxis, 1f);
            fireHeld = Input.GetMouseButton(0) || Input.GetKey(KeyCode.Space) || Input.GetKey(KeyCode.Return);
        }
    }
}
